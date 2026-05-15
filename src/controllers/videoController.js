const { isValidYouTubeURL, formatBytes, TEMP_DIR } = require("../utils/helpers");
const youtubeService = require("../services/youtubeService");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

/**
 * Write user-supplied cookies to a temp file and return its path.
 * Returns null if no cookies were provided.
 */
function writeUserCookies(cookies) {
  if (!cookies || typeof cookies !== "string" || !cookies.trim()) return null;
  const cookieFile = path.join(TEMP_DIR, `cookies_${crypto.randomBytes(6).toString("hex")}.txt`);
  fs.writeFileSync(cookieFile, cookies, "utf-8");
  return cookieFile;
}

function cleanupCookieFile(cookiePath) {
  if (cookiePath) {
    try { fs.unlinkSync(cookiePath); } catch (_) {}
  }
}

/**
 * GET /api/video/info?url=...
 * Returns video metadata.
 */
async function getInfo(req, res) {
  const { url, cookies } = req.body;

  if (!url || !isValidYouTubeURL(url)) {
    return res.status(400).json({ success: false, error: "Invalid YouTube URL" });
  }

  const cookiePath = writeUserCookies(cookies);
  try {
    const info = await youtubeService.getVideoInfo(url, cookiePath);
    res.json({ success: true, data: info });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  } finally {
    cleanupCookieFile(cookiePath);
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
    res.status(400).json({ success: false, error: "Invalid YouTube URL" });
    return;
  }

  const cookiePath = writeUserCookies(cookies);

  // Set up SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const emitter = youtubeService.downloadAndMerge(url, quality || "balanced", cookiePath);

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
    cleanupCookieFile(cookiePath);
    res.end();
  });

  emitter.on("error", (err) => {
    res.write(`data: ${JSON.stringify({ type: "error", error: err.message })}\n\n`);
    cleanupCookieFile(cookiePath);
    res.end();
  });

  // If client disconnects, nothing to clean up (ffmpeg will finish or fail)
  req.on("close", () => {
    emitter.removeAllListeners();
    cleanupCookieFile(cookiePath);
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
