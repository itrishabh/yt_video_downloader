const express = require("express");
const path = require("path");
const videoRoutes = require("./routes/videoRoutes");

const app = express();

// Middleware
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

// Routes
app.use("/api/video", videoRoutes);

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

module.exports = app;
