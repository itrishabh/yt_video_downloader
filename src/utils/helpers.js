const path = require("path");
const fs = require("fs");

const ROOT_DIR = path.join(__dirname, "..", "..");
const TEMP_DIR = path.join(ROOT_DIR, "temp");
const DOWNLOAD_DIR = path.join(ROOT_DIR, "downloads");
const COOKIES_PATH = path.join(ROOT_DIR, "cookies.txt");

/**
 * Write YouTube cookies from the YT_COOKIES environment variable to a file.
 * Call once at startup. Returns the cookie file path if available, or null.
 */
function setupCookies() {
  const cookieData = process.env.YT_COOKIES;
  if (cookieData) {
    fs.writeFileSync(COOKIES_PATH, cookieData, "utf-8");
    console.log("YouTube cookies loaded from YT_COOKIES env variable.");
    return COOKIES_PATH;
  }
  if (fs.existsSync(COOKIES_PATH)) {
    console.log("Using existing cookies.txt file.");
    return COOKIES_PATH;
  }
  console.warn("No YouTube cookies found. Requests from cloud IPs may be blocked.");
  return null;
}

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
  COOKIES_PATH,
  setupCookies,
  sanitizeFilename,
  isValidYouTubeURL,
  formatBytes,
};
