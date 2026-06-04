const { isValidYouTubeURL, formatBytes } = require("../utils/helpers");
const youtubeService = require("../services/youtubeService");
const logger = require("../utils/logger");

/**
 * GET /api/video/info?url=...
 * Returns video metadata.
 */
async function getInfo(req, res) {
  const { url, cookies } = req.body;

  if (!url || !isValidYouTubeURL(url)) {
    logger.warn("Invalid YouTube URL received", { url });
    return res.status(400).json({ success: false, error: "Invalid YouTube URL" });
  }

  try {
    logger.info("Fetching video info", { url });
    const info = await youtubeService.getVideoInfo(url, cookies || null);
    logger.info("Video info fetched", { title: info.title, duration: info.duration });
    res.json({ success: true, data: info });
  } catch (err) {
    logger.error("Failed to fetch video info", { url, error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * GET /api/video/qualities
 * Returns available quality presets.
 */
function getQualities(req, res) {
  const presets = Object.entries(youtubeService.QUALITY_PRESETS).map(([key, val]) => ({
    id: key,
    label: val.label,
    description: val.description,
  }));
  res.json({ success: true, data: presets });
}

/**
 * GET /api/video/download-sse?url=...&quality=...
 * SSE endpoint – streams progress events, then final result.
 */
function downloadSSE(req, res) {
  const { url, quality, cookies } = req.body;

  if (!url || !isValidYouTubeURL(url)) {
    logger.warn("Download SSE: Invalid YouTube URL", { url });
    res.status(400).json({ success: false, error: "Invalid YouTube URL" });
    return;
  }

  logger.info("Starting download", { url, quality: quality || "balanced" });

  // Set up SSE headers — disable buffering at every layer
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no", // Prevents nginx/reverse-proxy buffering
  });

  // Disable Nagle's algorithm so small writes are sent immediately
  if (req.socket) {
    req.socket.setNoDelay(true);
    req.socket.setTimeout(0);
  }

  // Flush headers immediately to establish the SSE connection
  res.flushHeaders();

  // Send initial event and flush it to the client
  res.write(`data: ${JSON.stringify({ type: "progress", phase: "Initializing...", percent: 0 })}\n\n`);

  // Defer the download start to next tick so the initial write is flushed
  setImmediate(() => {
    const emitter = youtubeService.downloadAndMerge(url, quality || "balanced", cookies || null);

    emitter.on("progress", (data) => {
      res.write(`data: ${JSON.stringify({ type: "progress", ...data })}\n\n`);
    });

    // Send SSE keepalive comments every 5s to prevent connection timeout
    const keepalive = setInterval(() => {
      res.write(`: keepalive\n\n`);
    }, 5000);

    emitter.on("done", (result) => {
      clearInterval(keepalive);
      logger.info("Download complete", { title: result.title, filename: result.filename, size: formatBytes(result.size) });
      res.write(
        `data: ${JSON.stringify({
          type: "done",
          title: result.title,
          filename: result.filename,
          size: result.size,
          sizeFormatted: formatBytes(result.size),
          downloadUrl: `/api/video/file/${encodeURIComponent(result.filename)}`,
        })}\n\n`
      );
      res.end();
    });

    emitter.on("error", (err) => {
      clearInterval(keepalive);
      logger.error("Download failed", { url, quality, error: err.message });
      res.write(`data: ${JSON.stringify({ type: "error", error: err.message })}\n\n`);
      res.end();
    });

    // If client disconnects
    req.on("close", () => {
      clearInterval(keepalive);
      logger.info("Client disconnected", { url });
      emitter.removeAllListeners();
    });
  });
}

/**
 * GET /api/video/file/:filename
 * Serves a downloaded mp4 file.
 */
function getFile(req, res) {
  const { filename } = req.params;
  const filePath = youtubeService.getDownloadedFilePath(filename);

  if (!filePath) {
    logger.warn("File not found", { filename });
    return res.status(404).json({ success: false, error: "File not found" });
  }

  logger.info("Serving file", { filename });
  res.download(filePath);
}

module.exports = {
  getInfo,
  getQualities,
  downloadSSE,
  getFile,
};
