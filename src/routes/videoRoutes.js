const express = require("express");
const router = express.Router();
const videoController = require("../controllers/videoController");

// POST /api/video/info                            — fetch video metadata
router.post("/info", videoController.getInfo);

// GET  /api/video/qualities                         — list available quality presets
router.get("/qualities", videoController.getQualities);

// POST /api/video/download-sse                      — SSE download with progress
router.post("/download-sse", videoController.downloadSSE);

// GET  /api/video/file/:filename     — serve downloaded file
router.get("/file/:filename", videoController.getFile);

module.exports = router;
