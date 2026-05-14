const { isValidYouTubeURL, formatBytes } = require("../utils/helpers");
const youtubeService = require("../services/youtubeService");

/**
 * GET /api/video/info?url=...
 * Returns video metadata.
 */
async function getInfo(req, res) {
  const { url } = req.query;

  if (!url || !isValidYouTubeURL(url)) {
    return res.status(400).json({ success: false, error: "Invalid YouTube URL" });
  }

  try {
    const info = await youtubeService.getVideoInfo(url);
    res.json({ success: true, data: info });
  } catch (err) {
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
  const { url, quality } = req.query;

  if (!url || !isValidYouTubeURL(url)) {
    res.status(400).json({ success: false, error: "Invalid YouTube URL" });
    return;
  }

  // Set up SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const emitter = youtubeService.downloadAndMerge(url, quality || "balanced");

  emitter.on("progress", (data) => {
    res.write(`data: ${JSON.stringify({ type: "progress", ...data })}\n\n`);
  });

  emitter.on("done", (result) => {
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
    res.write(`data: ${JSON.stringify({ type: "error", error: err.message })}\n\n`);
    res.end();
  });

  // If client disconnects, nothing to clean up (ffmpeg will finish or fail)
  req.on("close", () => {
    emitter.removeAllListeners();
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
    return res.status(404).json({ success: false, error: "File not found" });
  }

  res.download(filePath);
}

module.exports = {
  getInfo,
  getQualities,
  downloadSSE,
  getFile,
};
