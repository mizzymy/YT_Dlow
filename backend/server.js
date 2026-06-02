require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const {
  ensureBinary,
  getVideoInfo,
  listChannelVideos,
  startDownload,
} = require("./ytdlp");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PORT = process.env.PORT || 3001;
const API_KEY = process.env.API_KEY || "";
const FRONTEND_URL = process.env.FRONTEND_URL || "";

const app = express();
app.use(express.json());

// Allow any origin if FRONTEND_URL not set (open during initial setup),
// or match against a comma-separated list of allowed origins.
const allowedOrigins = FRONTEND_URL
  ? FRONTEND_URL.split(",").map((u) => u.trim())
  : null;

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow server-to-server requests (no origin) or if open
      if (!allowedOrigins || !origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-API-Key"],
  })
);

// ---------------------------------------------------------------------------
// Auth middleware (optional — skipped when API_KEY is empty)
// ---------------------------------------------------------------------------

function authMiddleware(req, res, next) {
  if (!API_KEY) return next();
  const provided = req.headers["x-api-key"];
  if (provided === API_KEY) return next();
  return res.status(401).json({ error: "Invalid or missing API key" });
}

app.use(authMiddleware);

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// GET /info?url=<youtube-url>
// Fetch video metadata (title, thumbnail, duration, formats)
// ---------------------------------------------------------------------------

app.get("/info", async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "Missing ?url= parameter" });

  try {
    const info = await getVideoInfo(url);

    // Extract the useful bits
    const formats = (info.formats || [])
      .filter((f) => f.height && f.vcodec !== "none")
      .map((f) => ({
        formatId: f.format_id,
        ext: f.ext,
        height: f.height,
        width: f.width,
        fps: f.fps,
        filesize: f.filesize || f.filesize_approx,
        vcodec: f.vcodec,
        acodec: f.acodec,
      }));

    // Deduplicate by height and pick the best per resolution
    const qualityMap = {};
    for (const f of formats) {
      if (!qualityMap[f.height] || (f.filesize || 0) > (qualityMap[f.height].filesize || 0)) {
        qualityMap[f.height] = f;
      }
    }

    const availableQualities = Object.keys(qualityMap)
      .map(Number)
      .sort((a, b) => b - a);

    res.json({
      id: info.id,
      title: info.title,
      description: info.description?.slice(0, 500),
      thumbnail: info.thumbnail,
      duration: info.duration,
      durationString: info.duration_string,
      channel: info.channel || info.uploader,
      channelUrl: info.channel_url || info.uploader_url,
      uploadDate: info.upload_date,
      viewCount: info.view_count,
      availableQualities,
    });
  } catch (err) {
    console.error("[/info] Error:", err.message);
    res.status(500).json({ error: "Failed to fetch video info", detail: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /channel?url=<channel-or-playlist-url>
// List all videos from a channel or playlist
// ---------------------------------------------------------------------------

app.get("/channel", async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "Missing ?url= parameter" });

  try {
    const videos = await listChannelVideos(url);

    const mapped = videos.map((v) => ({
      id: v.id,
      title: v.title,
      url: v.url || `https://www.youtube.com/watch?v=${v.id}`,
      thumbnail:
        v.thumbnails?.[v.thumbnails.length - 1]?.url ||
        `https://i.ytimg.com/vi/${v.id}/maxresdefault.jpg`,
      duration: v.duration,
      durationString: v.duration_string,
    }));

    res.json({ count: mapped.length, videos: mapped });
  } catch (err) {
    console.error("[/channel] Error:", err.message);
    res.status(500).json({ error: "Failed to list channel videos", detail: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /download?url=<youtube-url>&quality=<best|2160|1080|720|480|audio>
// Stream the video file directly to the client
// ---------------------------------------------------------------------------

app.get("/download", async (req, res) => {
  const { url, quality = "best" } = req.query;
  if (!url) return res.status(400).json({ error: "Missing ?url= parameter" });

  try {
    // First get video title for the filename
    const info = await getVideoInfo(url);
    const safeTitle = (info.title || "video")
      .replace(/[^a-zA-Z0-9 _-]/g, "")
      .slice(0, 100);

    const result = await startDownload(url, quality);

    if (result.isAudio) {
      // Audio downloads need temp file approach
      const ext = "mp3";
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${safeTitle}.${ext}"`
      );

      const child = spawn(result.binPath, result.args, {
        stdio: ["ignore", "pipe", "pipe"],
      });

      let outputPath = "";

      child.stdout.on("data", (chunk) => {
        outputPath += chunk.toString();
      });

      child.stderr.on("data", (data) => {
        const line = data.toString().trim();
        if (line) console.log(`[yt-dlp stderr] ${line}`);
      });

      child.on("close", (code) => {
        outputPath = outputPath.trim();
        if (code !== 0 || !outputPath || !fs.existsSync(outputPath)) {
          if (!res.headersSent) {
            res.status(500).json({ error: "Audio extraction failed" });
          }
          return;
        }

        // Stream the temp file
        const stream = fs.createReadStream(outputPath);
        stream.pipe(res);
        stream.on("end", () => {
          // Clean up temp file
          fs.unlink(outputPath, () => {});
        });
      });

      child.on("error", (err) => {
        console.error("[download] Spawn error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Download failed to start" });
        }
      });
    } else {
      // Video: stream directly from yt-dlp stdout
      const ext = "mp4";
      res.setHeader("Content-Type", "video/mp4");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${safeTitle}.${ext}"`
      );

      const { child } = result;

      child.stdout.pipe(res);

      child.stderr.on("data", (data) => {
        const line = data.toString().trim();
        if (line) console.log(`[yt-dlp stderr] ${line}`);
      });

      child.on("error", (err) => {
        console.error("[download] Spawn error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Download failed to start" });
        }
      });

      // If the client disconnects, kill yt-dlp
      req.on("close", () => {
        if (!child.killed) {
          child.kill("SIGTERM");
        }
      });
    }
  } catch (err) {
    console.error("[/download] Error:", err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: "Download failed", detail: err.message });
    }
  }
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function boot() {
  try {
    await ensureBinary();
    console.log("[boot] yt-dlp binary ready");
  } catch (err) {
    console.warn(
      "[boot] Could not ensure yt-dlp binary — downloads will fail:",
      err.message
    );
  }

  app.listen(PORT, () => {
    console.log(`\n🚀 YouTube Downloader Backend running on http://localhost:${PORT}`);
    console.log(`   Health: http://localhost:${PORT}/health`);
    console.log(
      API_KEY
        ? `   Auth:   API key required (X-API-Key header)`
        : `   Auth:   NONE (set API_KEY in .env to enable)`
    );
    console.log("");
  });
}

boot();
