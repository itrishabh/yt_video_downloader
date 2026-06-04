const path = require("path");
const fs = require("fs");

const ROOT_DIR = path.join(__dirname, "..", "..");
const TEMP_DIR = path.join(ROOT_DIR, "temp");
const DOWNLOAD_DIR = path.join(ROOT_DIR, "downloads");

function sanitizeFilename(name) {
  return name.replace(/[<>:"/\\|?*]+/g, "_").substring(0, 200);
}

function isValidYouTubeURL(url) {
  const pattern =
    /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/)/;
  return pattern.test(url);
}

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(2) + " " + sizes[i];
}

module.exports = {
  ROOT_DIR,
  TEMP_DIR,
  DOWNLOAD_DIR,
  sanitizeFilename,
  isValidYouTubeURL,
  formatBytes,
};
