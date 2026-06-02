FROM node:20-slim

# Install ffmpeg and python3 (needed by yt-dlp)
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg python3 && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json ./
RUN npm install --omit=dev

# Copy source code
COPY . .

# yt-dlp binary auto-downloads on first run into /app/bin/

EXPOSE 3001

CMD ["node", "server.js"]
