const express = require("express");
const path = require("path");
const videoRoutes = require("./routes/videoRoutes");
const poTokenService = require("./services/poTokenService");
const logger = require("./utils/logger");

const app = express();

// Middleware
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

// Request logging middleware (skip static files)
app.use("/api", (req, res, next) => {
  const start = Date.now();
  logger.info(`→ ${req.method} ${req.originalUrl}`, { ip: req.ip });

  res.on("finish", () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 400 ? "warn" : "info";
    logger[level](`← ${req.method} ${req.originalUrl} ${res.statusCode} (${duration}ms)`);
  });

  next();
});

// Routes
app.use("/api/video", videoRoutes);

// Health check — includes PO token status
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    poToken: {
      available: poTokenService.hasValidTokens(),
    },
  });
});

module.exports = app;
