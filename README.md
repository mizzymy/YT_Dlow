# YT Downloader

A full-stack YouTube video downloader with a premium dark-mode UI. Download your channel's videos in the highest quality available — 4K, 1080p, 720p, or audio-only MP3.

![Stack](https://img.shields.io/badge/Next.js-black?logo=next.js) ![Stack](https://img.shields.io/badge/Express-black?logo=express) ![Stack](https://img.shields.io/badge/yt--dlp-red)

## Architecture

```
┌─────────────────────────────────────────┐
│  Frontend (Next.js)                     │
│  Paste URL → See info → Download       │
└────────────────┬────────────────────────┘
                 │ REST API
┌────────────────▼────────────────────────┐
│  Backend (Express + yt-dlp + ffmpeg)    │
│  Streams video directly to browser      │
└─────────────────────────────────────────┘
```

## Quick Start (Local)

### Prerequisites

- **Node.js 18+**
- **ffmpeg** — [Download here](https://ffmpeg.org/download.html) and add to PATH
- **yt-dlp** — auto-downloaded by the backend on first run

### 1. Backend

```bash
cd backend
cp .env.example .env    # edit API_KEY if you want auth
npm install
npm run dev
```

The backend runs on `http://localhost:3001`.

### 2. Frontend

```bash
cd frontend
cp .env.example .env.local    # set API URL + key
npm install
npm run dev
```

Open `http://localhost:3000` in your browser.

## Features

- 🎬 **Single video download** — paste any YouTube URL, pick quality, download
- 📺 **Channel / playlist** — list all videos, download individually
- 🎯 **Quality selector** — 4K, 1080p, 720p, 480p, or audio-only MP3
- 📱 **Responsive** — works on desktop, tablet, and mobile
- 🌙 **Premium dark UI** — glassmorphism, smooth animations, gradient accents
- 📜 **Download history** — stored in your browser's localStorage
- 🔐 **Optional API key auth** — protect your instance

## Deployment

### Backend → Railway (recommended)

1. Push the `backend/` folder to a GitHub repo
2. Connect to [Railway](https://railway.app)
3. Railway auto-detects the Dockerfile
4. Set env vars: `API_KEY`, `FRONTEND_URL`
5. Deploy!

### Frontend → Vercel

1. Push the `frontend/` folder to a GitHub repo
2. Connect to [Vercel](https://vercel.com)
3. Set env vars: `NEXT_PUBLIC_API_URL` (your Railway URL), `NEXT_PUBLIC_API_KEY`
4. Deploy!

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/info?url=` | Fetch video metadata |
| GET | `/channel?url=` | List channel/playlist videos |
| GET | `/download?url=&quality=` | Stream video download |

**Quality options:** `best`, `2160`, `1080`, `720`, `480`, `audio`

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, TypeScript, Vanilla CSS |
| Backend | Node.js, Express |
| Engine | yt-dlp (via yt-dlp-wrap) |
| Merging | ffmpeg |

## License

For personal use only. Respect YouTube's Terms of Service.
