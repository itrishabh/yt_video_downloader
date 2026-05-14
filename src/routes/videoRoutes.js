const express = require("express");
const router = express.Router();
const videoController = require("../controllers/videoController");

// GET  /api/video/info?url=...       — fetch video metadata
router.get("/info", videoController.getInfo);

// GET  /api/video/qualities          — list available quality presets
router.get("/qualities", videoController.getQualities);

// GET  /api/video/download-sse?url=...&quality=...  — SSE download with progress
router.get("/download-sse", videoController.downloadSSE);

// GET  /api/video/file/:filename     — serve downloaded file
router.get("/file/:filename", videoController.getFile);

module.exports = router;
