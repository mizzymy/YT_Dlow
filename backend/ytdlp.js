const { execSync, spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const YTDlpWrap = require("yt-dlp-wrap").default;

// ---------------------------------------------------------------------------
// yt-dlp binary management
// ---------------------------------------------------------------------------

const BINARY_DIR = path.join(__dirname, "bin");
const BINARY_NAME = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
const BINARY_PATH = process.env.YTDLP_PATH || path.join(BINARY_DIR, BINARY_NAME);

/**
 * Ensure yt-dlp binary exists. Downloads it if missing.
 */
async function ensureBinary() {
  if (fs.existsSync(BINARY_PATH)) {
    console.log(`[ytdlp] Binary found at ${BINARY_PATH}`);
    return BINARY_PATH;
  }

  console.log("[ytdlp] Binary not found — downloading latest release…");
  fs.mkdirSync(BINARY_DIR, { recursive: true });

  await YTDlpWrap.downloadFromGithub(BINARY_PATH);
  console.log(`[ytdlp] Downloaded to ${BINARY_PATH}`);

  // Make executable on Unix
  if (process.platform !== "win32") {
    fs.chmodSync(BINARY_PATH, 0o755);
  }
  return BINARY_PATH;
}

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

let _ytdlp = null;

async function getYtdlp() {
  if (_ytdlp) return _ytdlp;
  const binPath = await ensureBinary();
  _ytdlp = new YTDlpWrap(binPath);
  return _ytdlp;
}

/**
 * Fetch metadata for a single video URL.
 * Returns the JSON object yt-dlp produces with --dump-json.
 */
async function getVideoInfo(url) {
  const ytdlp = await getYtdlp();
  const raw = await ytdlp.execPromise([
    url,
    "--dump-json",
    "--no-warnings",
    "--no-playlist",
  ]);
  return JSON.parse(raw);
}

/**
 * List all videos in a channel / playlist URL.
 * Returns an array of video metadata objects.
 */
async function listChannelVideos(url) {
  const ytdlp = await getYtdlp();
  const raw = await ytdlp.execPromise([
    url,
    "--dump-json",
    "--flat-playlist",
    "--no-warnings",
  ]);

  // yt-dlp outputs one JSON object per line for playlists
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.map((line) => JSON.parse(line));
}

/**
 * Build yt-dlp format string from a human-readable quality label.
 *
 * Quality labels:
 *   "best"   → best video+audio merged
 *   "2160"   → 4K
 *   "1080"   → Full HD
 *   "720"    → HD
 *   "480"    → SD
 *   "audio"  → best audio only (mp3)
 */
function qualityToFormat(quality = "best") {
  switch (quality) {
    case "2160":
      return "bestvideo[height<=2160]+bestaudio/best[height<=2160]";
    case "1080":
      return "bestvideo[height<=1080]+bestaudio/best[height<=1080]";
    case "720":
      return "bestvideo[height<=720]+bestaudio/best[height<=720]";
    case "480":
      return "bestvideo[height<=480]+bestaudio/best[height<=480]";
    case "audio":
      return "bestaudio/best";
    case "best":
    default:
      return "bestvideo+bestaudio/best";
  }
}

/**
 * Spawn a yt-dlp download process and return the child process.
 * The caller can pipe stdout to the HTTP response.
 *
 * @param {string} url      - YouTube video URL
 * @param {string} quality  - Quality label (see qualityToFormat)
 * @returns {{ child: ChildProcess, filename: string | null }}
 */
async function startDownload(url, quality = "best") {
  const binPath = await ensureBinary();
  const format = qualityToFormat(quality);

  const isAudio = quality === "audio";

  const args = [
    url,
    "-f",
    format,
    "--no-warnings",
    "--no-playlist",
    // Output to stdout so we can stream it
    "-o",
    "-",
    // Merge into mp4 (or mp3 for audio)
    ...(isAudio
      ? ["--extract-audio", "--audio-format", "mp3"]
      : ["--merge-output-format", "mp4"]),
  ];

  // For audio extraction we can't pipe to stdout easily,
  // so we use a different approach: download to temp then stream.
  if (isAudio) {
    // Remove the "-o", "-" args and use temp directory
    const tempDir = path.join(__dirname, "tmp");
    fs.mkdirSync(tempDir, { recursive: true });
    const outputTemplate = path.join(tempDir, "%(title)s.%(ext)s");

    const audioArgs = [
      url,
      "-f",
      "bestaudio/best",
      "--no-warnings",
      "--no-playlist",
      "--extract-audio",
      "--audio-format",
      "mp3",
      "-o",
      outputTemplate,
      "--print",
      "after_move:filepath",
    ];

    return { args: audioArgs, binPath, isAudio: true };
  }

  const child = spawn(binPath, args, {
    stdio: ["ignore", "pipe", "pipe"],
  });

  return { child, isAudio: false };
}

module.exports = {
  ensureBinary,
  getVideoInfo,
  listChannelVideos,
  startDownload,
  qualityToFormat,
};
