const youtubedl = require("youtube-dl-exec");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { EventEmitter } = require("events");
const { TEMP_DIR, DOWNLOAD_DIR, COOKIES_PATH, sanitizeFilename } = require("../utils/helpers");
const fs_helpers = require("fs");

// Build common yt-dlp options (includes cookies if available)
function baseYtdlpOpts() {
  const opts = {
    noCheckCertificates: true,
    noWarnings: true,
  };
  if (fs_helpers.existsSync(COOKIES_PATH)) {
    opts.cookies = COOKIES_PATH;
  }
  return opts;
}

ffmpeg.setFfmpegPath(ffmpegPath);

// Ensure directories exist
for (const dir of [TEMP_DIR, DOWNLOAD_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Quality presets — each defines yt-dlp format + ffmpeg encoding settings
const QUALITY_PRESETS = {
  fast: {
    label: "Fast (480p)",
    description: "Lower quality, fastest download & encode",
    videoFormat: "bestvideo[height<=480][vcodec^=avc1][ext=mp4]/bestvideo[height<=480][ext=mp4]/bestvideo[height<=480]",
    preset: "ultrafast",
    crf: "28",
    audioBitrate: "128k",
  },
  balanced: {
    label: "Balanced (720p)",
    description: "Good quality, moderate speed",
    videoFormat: "bestvideo[height<=720][vcodec^=avc1][ext=mp4]/bestvideo[height<=720][ext=mp4]/bestvideo[height<=720]",
    preset: "fast",
    crf: "23",
    audioBitrate: "192k",
  },
  high: {
    label: "High (1080p)",
    description: "Best quality, takes longer",
    videoFormat: "bestvideo[height<=1080][vcodec^=avc1][ext=mp4]/bestvideo[height<=1080][ext=mp4]/bestvideo[height<=1080]",
    preset: "medium",
    crf: "20",
    audioBitrate: "192k",
  },
  best: {
    label: "Best (Max Resolution)",
    description: "Maximum quality, slowest",
    videoFormat: "bestvideo[vcodec^=avc1][ext=mp4]/bestvideo[vcodec^=avc1]/bestvideo[ext=mp4]/bestvideo",
    preset: "medium",
    crf: "18",
    audioBitrate: "256k",
  },
};

/**
 * Fetch video metadata from YouTube.
 */
async function getVideoInfo(url) {
  const info = await youtubedl(url, {
    dumpSingleJson: true,
    ...baseYtdlpOpts(),
  });

  return {
    title: info.title,
    duration: info.duration || 0,
    channel: info.channel || info.uploader || "N/A",
    thumbnail: info.thumbnail,
  };
}

/**
 * Download video, download audio, merge into single .mp4, cleanup temp files.
 * Emits progress events on the returned emitter.
 * quality: one of "fast" | "balanced" | "high" | "best"
 */
function downloadAndMerge(url, quality = "balanced") {
  const progress = new EventEmitter();
  const preset = QUALITY_PRESETS[quality] || QUALITY_PRESETS.balanced;

  // Run the async work, emitting progress events
  (async () => {
    const info = await getVideoInfo(url);
    const title = sanitizeFilename(info.title);
    const finalName = title + ".mp4";
    const finalPath = path.join(DOWNLOAD_DIR, finalName);
    const duration = info.duration || 0;

    const jobId = crypto.randomBytes(8).toString("hex");
    const jobDir = path.join(TEMP_DIR, jobId);
    fs.mkdirSync(jobDir, { recursive: true });

    try {
      // Phase 1: Download video-only (0–35%)
      progress.emit("progress", { phase: "Downloading video", percent: 0 });
      const videoPath = path.join(jobDir, "video.mp4");
      await youtubedl(url, {
        output: videoPath,
        format: preset.videoFormat,
        ...baseYtdlpOpts(),
      });
      progress.emit("progress", { phase: "Video downloaded", percent: 35 });

      // Phase 2: Download audio-only (35–55%)
      progress.emit("progress", { phase: "Downloading audio", percent: 35 });
      const audioPath = path.join(jobDir, "audio.m4a");
      await youtubedl(url, {
        output: audioPath,
        format: "bestaudio[ext=m4a]/bestaudio",
        ...baseYtdlpOpts(),
      });
      progress.emit("progress", { phase: "Audio downloaded", percent: 55 });

      // Phase 3: Merge / re-encode with ffmpeg (55–100%)
      progress.emit("progress", { phase: "Encoding video", percent: 55 });
      await new Promise((resolve, reject) => {
        const cmd = ffmpeg()
          .input(videoPath)
          .input(audioPath)
          .outputOptions([
            "-c:v", "libx264",
            "-preset", preset.preset,
            "-crf", preset.crf,
            "-c:a", "aac",
            "-b:a", preset.audioBitrate,
            "-movflags", "+faststart",
            "-shortest",
          ])
          .output(finalPath);

        if (duration > 0) {
          cmd.on("progress", (p) => {
            // p.timemark is "HH:MM:SS.ms"
            const parts = (p.timemark || "0:0:0").split(":");
            const secs = (+parts[0]) * 3600 + (+parts[1]) * 60 + parseFloat(parts[2] || 0);
            const encodePercent = Math.min((secs / duration) * 100, 100);
            // Map 0-100% of encoding to 55-100% overall
            const overall = Math.round(55 + (encodePercent / 100) * 45);
            progress.emit("progress", { phase: "Encoding video", percent: overall });
          });
        }

        cmd
          .on("end", resolve)
          .on("error", reject)
          .run();
      });

      // Cleanup temp
      fs.rmSync(jobDir, { recursive: true, force: true });

      const stats = fs.statSync(finalPath);
      progress.emit("progress", { phase: "Complete", percent: 100 });
      progress.emit("done", {
        title: info.title,
        filename: finalName,
        size: stats.size,
        filePath: finalPath,
      });
    } catch (err) {
      if (fs.existsSync(jobDir)) {
        fs.rmSync(jobDir, { recursive: true, force: true });
      }
      progress.emit("error", err);
    }
  })();

  return progress;
}

/**
 * Get the absolute path of a file in the downloads directory.
 * Returns null if invalid or not found.
 */
function getDownloadedFilePath(filename) {
  if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
    return null;
  }
  const filePath = path.join(DOWNLOAD_DIR, filename);
  return fs.existsSync(filePath) ? filePath : null;
}

module.exports = {
  getVideoInfo,
  downloadAndMerge,
  getDownloadedFilePath,
  QUALITY_PRESETS,
};
