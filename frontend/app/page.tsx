"use client";

import { useState, useCallback, useEffect, useRef } from "react";

/* ═══════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════ */

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

interface HistoryEntry {
  title: string;
  quality: string;
  ts: number;
}

/* ═══════════════════════════════════════════════════════════
   Config
   ═══════════════════════════════════════════════════════════ */

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const KEY = process.env.NEXT_PUBLIC_API_KEY || "";

const hdrs = (): HeadersInit => {
  const h: HeadersInit = {};
  if (KEY) h["X-API-Key"] = KEY;
  return h;
};

/* ═══════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════ */

const fmtViews = (n?: number) => {
  if (!n) return "";
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M views`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K views`;
  return `${n} views`;
};

const fmtDate = (d?: string) => {
  if (!d || d.length !== 8) return "";
  const y = d.slice(0, 4), m = d.slice(4, 6), day = d.slice(6, 8);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[+m - 1]} ${+day}, ${y}`;
};

const QLABELS: Record<string, { label: string; sub?: string }> = {
  "2160": { label: "4K", sub: "2160p" },
  "1080": { label: "1080p", sub: "Full HD" },
  "720":  { label: "720p", sub: "HD" },
  "480":  { label: "480p", sub: "SD" },
  best:   { label: "Best", sub: "Auto" },
  audio:  { label: "MP3", sub: "Audio" },
};

const qLabel = (q: string) => QLABELS[q]?.label ?? q;

/* ═══════════════════════════════════════════════════════════
   Icons (inline SVG – no deps)
   ═══════════════════════════════════════════════════════════ */

const Icon = ({ d, size = 18, ...p }: { d: string; size?: number } & React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
    strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d={d} />
  </svg>
);

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" width="28" height="28" fill="white">
    <path d="M8 5v14l11-7z" />
  </svg>
);

const Icons = {
  search: "M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z",
  download: "M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3",
  paste: "M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2M9 2h6a1 1 0 011 1v2a1 1 0 01-1 1H9a1 1 0 01-1-1V3a1 1 0 011-1z",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  x: "M18 6L6 18M6 6l12 12",
  check: "M20 6L9 17l-5-5",
  video: "M23 7l-7 5 7 5V7zM1 5h14a2 2 0 012 2v10a2 2 0 01-2 2H1V5z",
  clock: "M12 2a10 10 0 100 20 10 10 0 000-20zM12 6v6l4 2",
};

/* ═══════════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════════ */

export default function Home() {
  /* ── State ─────────────────────────────────────────────── */
  const [mode, setMode] = useState<"single" | "channel">("single");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [quality, setQuality] = useState("best");
  const [downloading, setDownloading] = useState(false);
  const [downloadDone, setDownloadDone] = useState(false);

  const [chVideos, setChVideos] = useState<ChannelVideo[]>([]);
  const [chLoading, setChLoading] = useState(false);

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  /* ── Load history ──────────────────────────────────────── */
  useEffect(() => {
    try {
      const s = localStorage.getItem("ytdl_h");
      if (s) setHistory(JSON.parse(s));
    } catch { /* ignore */ }
  }, []);

  const pushHistory = useCallback((title: string, q: string) => {
    setHistory((prev) => {
      const next = [{ title, quality: q, ts: Date.now() }, ...prev].slice(0, 50);
      localStorage.setItem("ytdl_h", JSON.stringify(next));
      return next;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    localStorage.removeItem("ytdl_h");
  }, []);

  /* ── Paste from clipboard ──────────────────────────────── */
  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrl(text.trim());
        inputRef.current?.focus();
      }
    } catch {
      // clipboard permission denied — user can paste manually
    }
  }, []);

  /* ── Fetch single video info ───────────────────────────── */
  const fetchInfo = useCallback(async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError("");
    setVideoInfo(null);
    setDownloadDone(false);

    try {
      const res = await fetch(`${API}/info?url=${encodeURIComponent(url.trim())}`, { headers: hdrs() });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Error ${res.status}`);
      }
      const data: VideoInfo = await res.json();
      setVideoInfo(data);
      setQuality(data.availableQualities[0] ? String(data.availableQualities[0]) : "best");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to fetch info");
    } finally {
      setLoading(false);
    }
  }, [url]);

  /* ── Fetch channel / playlist ──────────────────────────── */
  const fetchChannel = useCallback(async () => {
    if (!url.trim()) return;
    setChLoading(true);
    setError("");
    setChVideos([]);

    try {
      const res = await fetch(`${API}/channel?url=${encodeURIComponent(url.trim())}`, { headers: hdrs() });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Error ${res.status}`);
      }
      const data = await res.json();
      setChVideos(data.videos || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load channel");
    } finally {
      setChLoading(false);
    }
  }, [url]);

  /* ── Download ──────────────────────────────────────────── */
  const download = useCallback(async (vUrl?: string, vTitle?: string) => {
    const dlUrl = vUrl || url;
    const dlTitle = vTitle || videoInfo?.title || "video";
    if (!dlUrl.trim()) return;

    setDownloading(true);
    setDownloadDone(false);
    setError("");

    try {
      const res = await fetch(
        `${API}/download?url=${encodeURIComponent(dlUrl.trim())}&quality=${quality}`,
        { headers: hdrs() },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Download failed (${res.status})`);
      }

      const disp = res.headers.get("Content-Disposition");
      let fname = `${dlTitle}.${quality === "audio" ? "mp3" : "mp4"}`;
      if (disp) {
        const m = disp.match(/filename="?(.+?)"?$/);
        if (m) fname = m[1];
      }

      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = fname;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);

      setDownloadDone(true);
      pushHistory(dlTitle, quality);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  }, [url, quality, videoInfo, pushHistory]);

  /* ── Keyboard ──────────────────────────────────────────── */
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") mode === "single" ? fetchInfo() : fetchChannel();
  };

  /* ── Quality list ──────────────────────────────────────── */
  const qOptions = videoInfo
    ? [
        ...(videoInfo.availableQualities.includes(2160) ? ["2160"] : []),
        ...(videoInfo.availableQualities.includes(1080) ? ["1080"] : []),
        ...(videoInfo.availableQualities.includes(720)  ? ["720"]  : []),
        ...(videoInfo.availableQualities.includes(480)  ? ["480"]  : []),
        "best",
        "audio",
      ]
    : [];

  const busy = loading || chLoading;

  /* ── Render ────────────────────────────────────────────── */
  return (
    <div className="app">
      {/* ── Header ──────────────────────────────────────── */}
      <header className="header">
        <div className="header__logo">
          <PlayIcon />
        </div>
        <h1 className="header__title">YT Downloader</h1>
        <p className="header__tagline">
          Grab your YouTube videos in full quality.<br />
          Paste a link, pick quality, download.
        </p>
      </header>

      {/* ── Main Panel ──────────────────────────────────── */}
      <div className="panel">
        {/* Tabs */}
        <div className="tabs">
          <button
            id="tab-single"
            className={`tab${mode === "single" ? " tab--active" : ""}`}
            onClick={() => { setMode("single"); setError(""); }}
          >
            <Icon d={Icons.video} size={15} />
            Single Video
          </button>
          <button
            id="tab-channel"
            className={`tab${mode === "channel" ? " tab--active" : ""}`}
            onClick={() => { setMode("channel"); setError(""); }}
          >
            <Icon d={Icons.list} size={15} />
            Channel
          </button>
        </div>

        {/* URL bar */}
        <div className="url-bar">
          <div className="url-bar__input-wrap">
            <input
              ref={inputRef}
              id="url-input"
              type="url"
              className="url-bar__input"
              placeholder={mode === "single" ? "Paste YouTube URL…" : "Paste channel / playlist URL…"}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={onKey}
              autoComplete="off"
              spellCheck={false}
            />
            <button
              className="url-bar__paste"
              onClick={handlePaste}
              title="Paste from clipboard"
              aria-label="Paste from clipboard"
            >
              <Icon d={Icons.paste} size={16} />
            </button>
          </div>
          <button
            id="fetch-btn"
            className="url-bar__go"
            onClick={mode === "single" ? fetchInfo : fetchChannel}
            disabled={busy || !url.trim()}
          >
            {busy ? <span className="spin" /> : <Icon d={Icons.search} size={17} />}
            <span className="url-bar__go-label">{mode === "single" ? "Fetch" : "List"}</span>
          </button>
        </div>

        {/* Error toast */}
        {error && (
          <div className="toast toast--error">
            <span className="toast__icon">⚠️</span>
            <span>{error}</span>
            <button className="toast__dismiss" onClick={() => setError("")} aria-label="Dismiss">
              <Icon d={Icons.x} size={14} />
            </button>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="result" style={{ marginTop: "var(--s4)" }}>
            <div className="skel-row">
              <div className="skel skel--thumb" />
              <div className="skel-lines">
                <div className="skel" style={{ height: 18, width: "85%" }} />
                <div className="skel" style={{ height: 14, width: "55%" }} />
                <div className="skel" style={{ height: 14, width: "35%" }} />
              </div>
            </div>
          </div>
        )}

        {/* ── Single Video Result ───────────────────────── */}
        {mode === "single" && videoInfo && (
          <div className="result" style={{ marginTop: "var(--s4)" }}>
            <div className="result__top">
              <div className="result__thumb-wrap">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={videoInfo.thumbnail} alt={videoInfo.title} />
                {videoInfo.durationString && (
                  <span className="result__badge">{videoInfo.durationString}</span>
                )}
              </div>

              <div className="result__meta">
                <h2 className="result__title">{videoInfo.title}</h2>
                <p className="result__channel">{videoInfo.channel}</p>
                <div className="result__stats">
                  {videoInfo.viewCount ? (
                    <span className="result__stat">{fmtViews(videoInfo.viewCount)}</span>
                  ) : null}
                  {videoInfo.uploadDate ? (
                    <span className="result__stat">{fmtDate(videoInfo.uploadDate)}</span>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Quality grid */}
            <div className="quality">
              <p className="quality__label">Select Quality</p>
              <div className="quality__grid">
                {qOptions.map((q) => {
                  const info = QLABELS[q] || { label: q };
                  return (
                    <button
                      key={q}
                      className={`quality__chip${quality === q ? " quality__chip--selected" : ""}`}
                      onClick={() => setQuality(q)}
                    >
                      {q === "2160" && <span className="quality__tag">4K</span>}
                      {info.label}
                      {info.sub && <span className="quality__chip-sub">{info.sub}</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Download CTA */}
            <button
              id="download-btn"
              className="dl-btn"
              onClick={() => download()}
              disabled={downloading}
            >
              {downloading ? (
                <>
                  <span className="spin" />
                  Downloading…
                </>
              ) : (
                <>
                  <Icon d={Icons.download} size={20} />
                  Download {qLabel(quality)}
                </>
              )}
            </button>

            {downloadDone && (
              <div className="toast toast--success" style={{ marginTop: "var(--s3)" }}>
                <span className="toast__icon"><Icon d={Icons.check} size={16} /></span>
                <span>Download started — check your browser downloads!</span>
              </div>
            )}
          </div>
        )}

        {/* Empty state — single mode, no result */}
        {mode === "single" && !videoInfo && !loading && !error && (
          <div className="empty">
            <div className="empty__icon">📺</div>
            <p className="empty__text">
              Paste a YouTube video link above to get started
            </p>
          </div>
        )}

        {/* ── Channel List ──────────────────────────────── */}
        {mode === "channel" && chLoading && (
          <div className="toast toast--info" style={{ marginTop: "var(--s3)" }}>
            <span className="spin" />
            <span>Scanning channel — this may take a moment…</span>
          </div>
        )}

        {mode === "channel" && chVideos.length > 0 && (
          <div style={{ marginTop: "var(--s3)" }}>
            <div className="ch-header">
              <span className="ch-count">{chVideos.length} video{chVideos.length !== 1 ? "s" : ""} found</span>
            </div>
            <div className="ch-list">
              {chVideos.map((v, i) => (
                <div key={v.id} className="ch-item" style={{ animationDelay: `${Math.min(i * 25, 500)}ms` }}>
                  <div className="ch-thumb">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={v.thumbnail} alt={v.title} loading="lazy" />
                  </div>
                  <div className="ch-meta">
                    <p className="ch-title">{v.title}</p>
                    {v.durationString && <span className="ch-dur">{v.durationString}</span>}
                  </div>
                  <button
                    className="ch-dl"
                    onClick={() => download(v.url, v.title)}
                    disabled={downloading}
                    aria-label={`Download ${v.title}`}
                  >
                    <Icon d={Icons.download} size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {mode === "channel" && !chLoading && chVideos.length === 0 && !error && (
          <div className="empty">
            <div className="empty__icon">📂</div>
            <p className="empty__text">
              Paste a channel or playlist URL to see all videos
            </p>
          </div>
        )}
      </div>

      {/* ── Download History ────────────────────────────── */}
      {history.length > 0 && (
        <div className="history">
          <div className="history__head">
            <span className="history__label">Recent Downloads</span>
            <button className="history__clear" onClick={clearHistory}>Clear</button>
          </div>
          <div className="history__list">
            {history.slice(0, 8).map((h, i) => (
              <div key={i} className="history__row">
                <span className="history__dot" />
                <span className="history__name">{h.title}</span>
                <span className="history__detail">
                  {qLabel(h.quality)} · {new Date(h.ts).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Footer ──────────────────────────────────────── */}
      <footer className="footer">
        Powered by{" "}
        <a href="https://github.com/yt-dlp/yt-dlp" target="_blank" rel="noopener noreferrer">
          yt-dlp
        </a>{" "}
        · Personal use only
      </footer>
    </div>
  );
}
