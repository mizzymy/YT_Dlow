"use client";

import { useState, useCallback, useEffect } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VideoInfo {
  id: string;
  title: string;
  description?: string;
  thumbnail: string;
  duration: number;
  durationString: string;
  channel: string;
  channelUrl?: string;
  uploadDate?: string;
  viewCount?: number;
  availableQualities: number[];
}

interface ChannelVideo {
  id: string;
  title: string;
  url: string;
  thumbnail: string;
  duration?: number;
  durationString?: string;
}

interface HistoryItem {
  title: string;
  quality: string;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const API_KEY = process.env.NEXT_PUBLIC_API_KEY || "";

function apiHeaders(): HeadersInit {
  const h: HeadersInit = { "Content-Type": "application/json" };
  if (API_KEY) h["X-API-Key"] = API_KEY;
  return h;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatViews(n?: number): string {
  if (!n) return "";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M views`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K views`;
  return `${n} views`;
}

function formatDate(d?: string): string {
  if (!d || d.length !== 8) return "";
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

function qualityLabel(q: string): string {
  const map: Record<string, string> = {
    best: "Best Quality",
    "2160": "4K",
    "1080": "1080p",
    "720": "720p",
    "480": "480p",
    audio: "MP3 Audio",
  };
  return map[q] || q;
}

// ---------------------------------------------------------------------------
// SVG Icons
// ---------------------------------------------------------------------------

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" width="36" height="36" fill="white">
    <path d="M8 5v14l11-7z" />
  </svg>
);

const DownloadIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const ListIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" />
    <line x1="3" y1="12" x2="3.01" y2="12" />
    <line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
);

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export default function Home() {
  const [mode, setMode] = useState<"single" | "channel">("single");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Single video state
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [quality, setQuality] = useState("best");
  const [downloading, setDownloading] = useState(false);
  const [downloadDone, setDownloadDone] = useState(false);

  // Channel state
  const [channelVideos, setChannelVideos] = useState<ChannelVideo[]>([]);
  const [channelLoading, setChannelLoading] = useState(false);

  // History
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // Load history from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("ytdl_history");
      if (stored) setHistory(JSON.parse(stored));
    } catch {
      /* ignore */
    }
  }, []);

  const addToHistory = useCallback(
    (title: string, q: string) => {
      const item: HistoryItem = {
        title,
        quality: q,
        timestamp: Date.now(),
      };
      const updated = [item, ...history].slice(0, 50);
      setHistory(updated);
      localStorage.setItem("ytdl_history", JSON.stringify(updated));
    },
    [history]
  );

  // ── Fetch Video Info ──────────────────────────────────

  const fetchInfo = useCallback(async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError("");
    setVideoInfo(null);
    setDownloadDone(false);

    try {
      const res = await fetch(
        `${API_BASE}/info?url=${encodeURIComponent(url.trim())}`,
        { headers: apiHeaders() }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server error ${res.status}`);
      }
      const data: VideoInfo = await res.json();
      setVideoInfo(data);

      // Auto-select best available quality
      if (data.availableQualities.length > 0) {
        const best = data.availableQualities[0];
        setQuality(String(best));
      } else {
        setQuality("best");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to fetch video info";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [url]);

  // ── Fetch Channel Videos ──────────────────────────────

  const fetchChannel = useCallback(async () => {
    if (!url.trim()) return;
    setChannelLoading(true);
    setError("");
    setChannelVideos([]);

    try {
      const res = await fetch(
        `${API_BASE}/channel?url=${encodeURIComponent(url.trim())}`,
        { headers: apiHeaders() }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server error ${res.status}`);
      }
      const data = await res.json();
      setChannelVideos(data.videos || []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to fetch channel";
      setError(message);
    } finally {
      setChannelLoading(false);
    }
  }, [url]);

  // ── Download Video ────────────────────────────────────

  const startDownload = useCallback(
    async (videoUrl?: string, videoTitle?: string) => {
      const dlUrl = videoUrl || url;
      const dlTitle = videoTitle || videoInfo?.title || "video";
      if (!dlUrl.trim()) return;

      setDownloading(true);
      setDownloadDone(false);
      setError("");

      try {
        const res = await fetch(
          `${API_BASE}/download?url=${encodeURIComponent(dlUrl.trim())}&quality=${quality}`,
          { headers: apiHeaders() }
        );

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Download failed (${res.status})`);
        }

        // Get filename from Content-Disposition or fallback
        const disposition = res.headers.get("Content-Disposition");
        let filename = `${dlTitle}.mp4`;
        if (disposition) {
          const match = disposition.match(/filename="?(.+?)"?$/);
          if (match) filename = match[1];
        }

        // Stream response to blob and trigger download
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);

        setDownloadDone(true);
        addToHistory(dlTitle, quality);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Download failed";
        setError(message);
      } finally {
        setDownloading(false);
      }
    },
    [url, quality, videoInfo, addToHistory]
  );

  // ── Handle Enter Key ──────────────────────────────────

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      if (mode === "single") fetchInfo();
      else fetchChannel();
    }
  };

  // ── Quality options to show ───────────────────────────

  const qualityOptions = videoInfo
    ? [
        ...(videoInfo.availableQualities.includes(2160) ? ["2160"] : []),
        ...(videoInfo.availableQualities.includes(1080) ? ["1080"] : []),
        ...(videoInfo.availableQualities.includes(720) ? ["720"] : []),
        ...(videoInfo.availableQualities.includes(480) ? ["480"] : []),
        "best",
        "audio",
      ]
    : ["best", "1080", "720", "480", "audio"];

  // ── Render ────────────────────────────────────────────

  return (
    <div className="container">
      {/* Header */}
      <header className="header">
        <div className="header__icon">
          <PlayIcon />
        </div>
        <h1 className="header__title">YT Downloader</h1>
        <p className="header__subtitle">
          Download your YouTube videos in the highest quality. Paste a link and go.
        </p>
      </header>

      {/* Mode Tabs */}
      <div className="card">
        <div className="mode-tabs">
          <button
            id="tab-single"
            className={`mode-tab ${mode === "single" ? "mode-tab--active" : ""}`}
            onClick={() => {
              setMode("single");
              setError("");
            }}
          >
            <SearchIcon /> Single Video
          </button>
          <button
            id="tab-channel"
            className={`mode-tab ${mode === "channel" ? "mode-tab--active" : ""}`}
            onClick={() => {
              setMode("channel");
              setError("");
            }}
          >
            <ListIcon /> Channel / Playlist
          </button>
        </div>

        {/* URL Input */}
        <div className="input-group">
          <div className="input-group__field">
            <input
              id="url-input"
              type="text"
              className="input"
              placeholder={
                mode === "single"
                  ? "Paste YouTube video URL…"
                  : "Paste channel or playlist URL…"
              }
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>
          <button
            id="fetch-btn"
            className="btn btn--primary"
            onClick={mode === "single" ? fetchInfo : fetchChannel}
            disabled={loading || channelLoading || !url.trim()}
          >
            {loading || channelLoading ? (
              <span className="spinner" />
            ) : (
              <SearchIcon />
            )}
            {mode === "single" ? "Fetch" : "List"}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="status status--error">
            <span>⚠</span>
            <span>{error}</span>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="video-info">
            <div className="video-info__preview">
              <div
                className="skeleton"
                style={{ width: 240, aspectRatio: "16/9" }}
              />
              <div style={{ flex: 1, display: "grid", gap: 8 }}>
                <div className="skeleton" style={{ height: 20, width: "80%" }} />
                <div className="skeleton" style={{ height: 14, width: "50%" }} />
                <div className="skeleton" style={{ height: 14, width: "30%" }} />
              </div>
            </div>
          </div>
        )}

        {/* ── Single Video Info ─────────────────────── */}
        {mode === "single" && videoInfo && (
          <div className="video-info">
            <div className="video-info__preview">
              <div className="video-info__thumbnail">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={videoInfo.thumbnail} alt={videoInfo.title} />
                {videoInfo.durationString && (
                  <span className="video-info__duration">
                    {videoInfo.durationString}
                  </span>
                )}
              </div>
              <div className="video-info__meta">
                <h2 className="video-info__title">{videoInfo.title}</h2>
                <p className="video-info__channel">{videoInfo.channel}</p>
                <div className="video-info__stats">
                  {videoInfo.viewCount && (
                    <span className="video-info__stat">
                      {formatViews(videoInfo.viewCount)}
                    </span>
                  )}
                  {videoInfo.uploadDate && (
                    <span className="video-info__stat">
                      {formatDate(videoInfo.uploadDate)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Quality Selector */}
            <div className="quality-section">
              <p className="quality-section__label">Quality</p>
              <div className="quality-options">
                {qualityOptions.map((q) => (
                  <button
                    key={q}
                    className={`quality-option ${quality === q ? "quality-option--active" : ""}`}
                    onClick={() => setQuality(q)}
                  >
                    {qualityLabel(q)}
                    {q === "2160" && (
                      <span className="quality-option__badge">4K</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Download Button */}
            <div className="download-actions">
              <button
                id="download-btn"
                className="btn btn--primary"
                onClick={() => startDownload()}
                disabled={downloading}
              >
                {downloading ? (
                  <>
                    <span className="spinner" />
                    Downloading…
                  </>
                ) : (
                  <>
                    <DownloadIcon />
                    Download {qualityLabel(quality)}
                  </>
                )}
              </button>
            </div>

            {/* Download complete */}
            {downloadDone && (
              <div className="status status--success">
                <CheckIcon />
                <span>Download started! Check your browser downloads.</span>
              </div>
            )}
          </div>
        )}

        {/* ── Channel Video List ───────────────────── */}
        {mode === "channel" && channelLoading && (
          <div className="status status--loading">
            <span className="spinner" />
            <span>Loading channel videos… this may take a moment</span>
          </div>
        )}

        {mode === "channel" && channelVideos.length > 0 && (
          <div className="channel-list">
            <div className="channel-list__header">
              <span className="channel-list__count">
                {channelVideos.length} videos found
              </span>
            </div>
            {channelVideos.map((video, idx) => (
              <div
                key={video.id}
                className="channel-item"
                style={{ animationDelay: `${idx * 30}ms` }}
              >
                <div className="channel-item__thumb">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={video.thumbnail} alt={video.title} />
                </div>
                <div className="channel-item__info">
                  <p className="channel-item__title">{video.title}</p>
                  {video.durationString && (
                    <span className="channel-item__duration">
                      {video.durationString}
                    </span>
                  )}
                </div>
                <div className="channel-item__actions">
                  <button
                    className="btn btn--primary btn--sm"
                    onClick={() => startDownload(video.url, video.title)}
                    disabled={downloading}
                  >
                    <DownloadIcon />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Download History */}
      {history.length > 0 && (
        <div className="history">
          <h3 className="history__title">Recent Downloads</h3>
          <div className="history__list">
            {history.slice(0, 10).map((item, idx) => (
              <div key={idx} className="history__item">
                <span className="history__item-icon">
                  <CheckIcon />
                </span>
                <span className="history__item-title">{item.title}</span>
                <span className="history__item-time">
                  {qualityLabel(item.quality)} ·{" "}
                  {new Date(item.timestamp).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="footer">
        <p>
          Built with{" "}
          <a
            href="https://github.com/yt-dlp/yt-dlp"
            target="_blank"
            rel="noopener noreferrer"
          >
            yt-dlp
          </a>{" "}
          · For personal use only
        </p>
      </footer>
    </div>
  );
}
