/**
 * Simple structured logger with timestamps and levels.
 * Outputs to stdout/stderr with color coding.
 */

const LEVELS = { info: "INFO", warn: "WARN", error: "ERROR" };

const COLORS = {
  info: "\x1b[36m",   // cyan
  warn: "\x1b[33m",   // yellow
  error: "\x1b[31m",  // red
  reset: "\x1b[0m",
  dim: "\x1b[2m",
};

function formatTimestamp() {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function formatMeta(meta) {
  if (!meta || Object.keys(meta).length === 0) return "";
  const parts = Object.entries(meta)
    .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(" ");
  return ` ${COLORS.dim}${parts}${COLORS.reset}`;
}

function log(level, message, meta) {
  const color = COLORS[level] || COLORS.info;
  const timestamp = formatTimestamp();
  const tag = LEVELS[level] || "INFO";
  const metaStr = formatMeta(meta);
  const output = `${COLORS.dim}${timestamp}${COLORS.reset} ${color}[${tag}]${COLORS.reset} ${message}${metaStr}`;

  if (level === "error") {
    process.stderr.write(output + "\n");
  } else {
    process.stdout.write(output + "\n");
  }
}

module.exports = {
  info: (msg, meta) => log("info", msg, meta),
  warn: (msg, meta) => log("warn", msg, meta),
  error: (msg, meta) => log("error", msg, meta),
};
