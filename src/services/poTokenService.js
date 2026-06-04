const puppeteer = require("puppeteer-core");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const debug = require("debug")("app:po-token");

const ROOT_DIR = path.join(__dirname, "..", "..");

/**
 * Detect the installed Chrome/Chromium executable path on the system.
 * Checks: env var → build-installed Chrome (.cache/puppeteer) → system Chrome
 */
function findChromePath() {
  // 1. Env var override
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }

  // 2. Check .cache/puppeteer (installed by build script on Render)
  const cacheDir = path.join(ROOT_DIR, ".cache", "puppeteer");
  if (fs.existsSync(cacheDir)) {
    try {
      // Find the chrome executable inside the cache
      const entries = fs.readdirSync(cacheDir);
      for (const entry of entries) {
        const chromeDir = path.join(cacheDir, entry);
        // Linux path structure: chrome/linux-VERSION/chrome-linux64/chrome
        const candidates = [
          path.join(chromeDir, "chrome-linux64", "chrome"),
          path.join(chromeDir, "chrome-linux", "chrome"),
          path.join(chromeDir, "chrome"),
        ];
        // Recurse one more level for versioned subdirectories
        if (fs.existsSync(chromeDir) && fs.statSync(chromeDir).isDirectory()) {
          const subEntries = fs.readdirSync(chromeDir);
          for (const sub of subEntries) {
            candidates.push(
              path.join(chromeDir, sub, "chrome-linux64", "chrome"),
              path.join(chromeDir, sub, "chrome-linux", "chrome"),
              path.join(chromeDir, sub, "chrome")
            );
          }
        }
        for (const c of candidates) {
          if (fs.existsSync(c)) {
            debug("Found cached browser at: %s", c);
            return c;
          }
        }
      }
    } catch {
      // ignore cache read errors
    }
  }

  // 3. System-installed browsers
  const candidates = [];

  if (process.platform === "win32") {
    candidates.push(
      (process.env["PROGRAMFILES(X86)"] || "") + "\\Google\\Chrome\\Application\\chrome.exe",
      (process.env["PROGRAMFILES"] || "") + "\\Google\\Chrome\\Application\\chrome.exe",
      (process.env.LOCALAPPDATA || "") + "\\Google\\Chrome\\Application\\chrome.exe",
      (process.env["PROGRAMFILES(X86)"] || "") + "\\Microsoft\\Edge\\Application\\msedge.exe",
      (process.env["PROGRAMFILES"] || "") + "\\Microsoft\\Edge\\Application\\msedge.exe"
    );
  } else if (process.platform === "darwin") {
    candidates.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium"
    );
  } else {
    // Linux
    candidates.push("/usr/bin/google-chrome", "/usr/bin/chromium-browser", "/usr/bin/chromium");
    try {
      const which = execSync("which google-chrome 2>/dev/null || which chromium-browser 2>/dev/null || which chromium 2>/dev/null")
        .toString()
        .trim();
      if (which) candidates.unshift(which);
    } catch {
      // ignore
    }
  }

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      debug("Found system browser at: %s", candidate);
      return candidate;
    }
  }

  return null;
}

/**
 * PO Token Service — Dynamic Proof of Origin Token Provider
 *
 * YouTube uses BotGuard (Proof of Origin) tokens to verify that requests
 * come from legitimate browsers. This service runs a headless browser,
 * navigates to YouTube, lets BotGuard execute naturally, and extracts
 * the resulting visitor_data and PO token.
 *
 * Tokens are cached and refreshed automatically before expiry.
 */
class POTokenService {
  constructor() {
    this.cachedVisitorData = null;
    this.cachedPoToken = null;
    this.tokenExpiry = null;
    this.isGenerating = false;
    this.pendingPromise = null;
    this.browser = null;

    // Tokens are valid for ~6 hours; refresh at 5 hours to avoid edge cases
    this.TOKEN_LIFETIME_MS = 5 * 60 * 60 * 1000;
  }

  /**
   * Get cached PO token and visitor_data, generating fresh ones if needed.
   * Returns { poToken, visitorData } or { poToken: null, visitorData: null } on failure.
   */
  async getTokens() {
    // Return cached tokens if still valid
    if (this.cachedPoToken && this.cachedVisitorData && this.tokenExpiry > Date.now()) {
      debug("Using cached PO token (expires in %d min)", Math.round((this.tokenExpiry - Date.now()) / 60000));
      return { poToken: this.cachedPoToken, visitorData: this.cachedVisitorData };
    }

    // Deduplicate concurrent generation requests
    if (this.isGenerating && this.pendingPromise) {
      debug("Token generation already in progress, waiting...");
      return this.pendingPromise;
    }

    this.isGenerating = true;
    this.pendingPromise = this._generateTokens();

    try {
      const result = await this.pendingPromise;
      return result;
    } finally {
      this.isGenerating = false;
      this.pendingPromise = null;
    }
  }

  /**
   * Core token generation logic using headless browser.
   */
  async _generateTokens() {
    let browser = null;

    const chromePath = findChromePath();
    if (!chromePath) {
      console.error("[POTokenService] No Chrome/Chromium found. Set CHROME_PATH env or run the build script.");
      return { poToken: null, visitorData: null };
    }

    try {
      debug("Launching headless browser for PO token generation...");
      debug("Using browser: %s", chromePath);

      browser = await puppeteer.launch({
        headless: "new",
        executablePath: chromePath,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--disable-gpu",
          "--window-size=1280,720",
          "--ignore-certificate-errors",
        ],
      });

      const page = await browser.newPage();

      // Set a realistic user agent
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
      );

      // Intercept requests to capture PO token from YouTube's API calls
      let interceptedPoToken = null;
      let interceptedVisitorData = null;

      await page.setRequestInterception(true);
      page.on("request", (req) => {
        // Block unnecessary resources for speed
        const type = req.resourceType();
        if (["image", "media", "font", "stylesheet"].includes(type)) {
          req.abort();
        } else {
          req.continue();
        }
      });

      page.on("response", async (response) => {
        try {
          const url = response.url();

          // Capture visitor_data from response headers
          const headers = response.headers();
          if (headers["x-goog-visitor-id"] && !interceptedVisitorData) {
            interceptedVisitorData = headers["x-goog-visitor-id"];
            debug("Captured visitor_data from response header");
          }

          // Capture PO token from YouTube's attestation or player API responses
          if (
            url.includes("/youtubei/v1/player") ||
            url.includes("/youtubei/v1/att/get")
          ) {
            const text = await response.text().catch(() => "");
            // Look for serviceIntegrityDimensions containing poToken
            const poMatch = text.match(/"poToken"\s*:\s*"([^"]+)"/);
            if (poMatch) {
              interceptedPoToken = poMatch[1];
              debug("Captured PO token from API response");
            }
          }
        } catch {
          // Ignore response parsing errors
        }
      });

      // Navigate to a YouTube embed page (lighter than full YouTube)
      debug("Navigating to YouTube...");
      await page.goto("https://www.youtube.com/embed/jNQXAC9IVRw", {
        waitUntil: "networkidle2",
        timeout: 30000,
      });

      // Extract visitor_data from the page's ytcfg
      const pageData = await page.evaluate(() => {
        /* eslint-disable no-undef */
        const cfg =
          (typeof ytcfg !== "undefined" && ytcfg.data_) ||
          (typeof yt !== "undefined" && yt.config_) ||
          {};
        return {
          visitorData: cfg.VISITOR_DATA || cfg.DELEGATED_SESSION_ID || null,
          innertubeApiKey: cfg.INNERTUBE_API_KEY || null,
        };
        /* eslint-enable no-undef */
      });

      if (pageData.visitorData && !interceptedVisitorData) {
        interceptedVisitorData = pageData.visitorData;
        debug("Extracted visitor_data from ytcfg");
      }

      // If we haven't captured the PO token yet, trigger a player request
      if (!interceptedPoToken && interceptedVisitorData) {
        debug("Triggering player request for PO token...");
        await page.evaluate(async (apiKey, visitorData) => {
          try {
            const response = await fetch(
              `https://www.youtube.com/youtubei/v1/player?key=${apiKey || "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8"}&pretokenize=1`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "X-Goog-Visitor-Id": visitorData,
                },
                body: JSON.stringify({
                  videoId: "jNQXAC9IVRw",
                  context: {
                    client: {
                      clientName: "WEB",
                      clientVersion: "2.20241126.01.00",
                      hl: "en",
                      gl: "US",
                      visitorData: visitorData,
                    },
                  },
                  serviceIntegrityDimensions: { poTokenRequired: true },
                }),
              }
            );
            await response.json();
          } catch {
            // Ignore errors
          }
        }, pageData.innertubeApiKey, interceptedVisitorData);

        // Wait for BotGuard to process and generate token
        await new Promise((r) => setTimeout(r, 5000));
      }

      // Final attempt: extract any PO token stored in the page
      if (!interceptedPoToken) {
        const pagePoToken = await page.evaluate(() => {
          try {
            // BotGuard may store the token in sessionStorage
            const stored = sessionStorage.getItem("potoken");
            if (stored) return stored;

            // Check for token in ytInitialPlayerResponse
            /* eslint-disable no-undef */
            if (typeof ytInitialPlayerResponse !== "undefined") {
              const sid = ytInitialPlayerResponse?.serviceIntegrityDimensions;
              if (sid?.poToken) return sid.poToken;
            }
            /* eslint-enable no-undef */
          } catch {
            // Ignore
          }
          return null;
        });

        if (pagePoToken) {
          interceptedPoToken = pagePoToken;
          debug("Extracted PO token from page state");
        }
      }

      // Cache the results
      if (interceptedVisitorData) {
        this.cachedVisitorData = interceptedVisitorData;
        this.cachedPoToken = interceptedPoToken; // May be null; visitor_data alone still helps
        this.tokenExpiry = Date.now() + this.TOKEN_LIFETIME_MS;

        debug(
          "Token generation complete — visitorData: %s, poToken: %s",
          interceptedVisitorData ? "YES" : "NO",
          interceptedPoToken ? "YES" : "NO"
        );

        return { poToken: interceptedPoToken, visitorData: interceptedVisitorData };
      }

      debug("Token generation failed — could not extract visitor_data");
      return { poToken: null, visitorData: null };
    } catch (err) {
      debug("Token generation error: %s", err.message);
      console.error("[POTokenService] Error generating tokens:", err.message);
      return { poToken: null, visitorData: null };
    } finally {
      if (browser) {
        await browser.close().catch(() => {});
      }
    }
  }

  /**
   * Force a refresh of the cached tokens.
   */
  async refreshTokens() {
    this.cachedPoToken = null;
    this.cachedVisitorData = null;
    this.tokenExpiry = null;
    return this.getTokens();
  }

  /**
   * Check if tokens are currently available (cached and valid).
   */
  hasValidTokens() {
    return !!(this.cachedPoToken && this.cachedVisitorData && this.tokenExpiry > Date.now());
  }
}

// Export singleton instance
module.exports = new POTokenService();
