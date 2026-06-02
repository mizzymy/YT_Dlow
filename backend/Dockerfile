FROM node:20-slim

# Install ffmpeg
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg python3 && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci --production

# Copy source
COPY . .

# yt-dlp binary will be auto-downloaded on first run
# into /app/bin/

EXPOSE 3001

CMD ["node", "server.js"]
