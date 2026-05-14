# YouTube Video Downloader

A Node.js web application to download YouTube videos to local storage.

## Setup

```bash
npm install
```

## Usage

```bash
# Start the server
npm start

# Start with auto-reload (development)
npm run dev
```

The server runs at `http://localhost:3000` by default. Set the `PORT` environment variable to change it.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/video/info?url=...` | Get video metadata |
| GET | `/api/video/qualities` | List available quality options |
| GET | `/api/video/download-sse?url=...&quality=...` | Download a video (SSE progress) |
| GET | `/api/video/file/:filename` | Retrieve a downloaded file |
| GET | `/api/health` | Health check |

## Dependencies

- **express** - Web server
- **youtube-dl-exec** - YouTube video downloading
- **fluent-ffmpeg** / **@ffmpeg-installer/ffmpeg** - Media processing
