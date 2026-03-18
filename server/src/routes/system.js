const { Router } = require("express");
const axios = require("axios");
const storeService = require("../services/store-service");
const alertService = require("../services/alert-service");
const { checkAllStores } = require("../services/health-checker");
const authService = require("../services/auth-service");
const { getCronStats } = require("../services/cron-telemetry");

const GITHUB_REPO = "camster91/woo-comprehensive-monitor";

const router = Router();

router.get("/health", (req, res) => {
  const stores = storeService.getAllStores();
  const { total } = alertService.getAlertStats();
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "3.1.0",
    stores: stores.length,
    total_alerts: total,
    uptime: process.uptime(),
    features: {
      frontend_monitoring: true,
      backend_health_checks: true,
      email_alerts: !!(process.env.MAILGUN_API_KEY),
      dashboard_api: true,
      store_statistics: true,
      feature_tracking: true,
      sites_monitored: stores.length,
    },
  });
});

router.get("/system/config", (req, res) => {
  res.json({
    allowed_emails: authService.ALLOWED_EMAILS,
    require_auth: authService.REQUIRE_AUTH,
    mailgun_configured: !!(process.env.MAILGUN_API_KEY),
    deepseek_configured: !!(process.env.DEEPSEEK_API_KEY),
    environment: process.env.NODE_ENV || "development",
    server_version: "3.1.0",
    node_version: process.version,
    memory: process.memoryUsage(),
    uptime: process.uptime(),
    cronStats: getCronStats(),
  });
});

router.post("/health-check-all", async (req, res) => {
  const results = await checkAllStores();
  res.json({ success: true, results });
});

router.post("/test-connections", async (req, res) => {
  const results = await checkAllStores();
  res.json({ success: true, results });
});

router.get("/export/all", (req, res) => {
  const stores = storeService.getAllStores().map(s => ({
    ...s,
    consumer_key: s.consumer_key ? "REDACTED" : null,
    consumer_secret: s.consumer_secret ? "REDACTED" : null,
  }));
  const { alerts } = alertService.getAlerts({ limit: 1000 });
  res.json({ exported_at: new Date().toISOString(), stores, alerts });
});

// Latest plugin release info (cached 1h)
let _releaseCache = null;
let _releaseCacheTime = 0;

router.get("/plugin/latest", async (req, res) => {
  try {
    const now = Date.now();
    if (_releaseCache && now - _releaseCacheTime < 3600000) {
      return res.json(_releaseCache);
    }
    const { data } = await axios.get(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: { Accept: "application/vnd.github.v3+json", "User-Agent": "WooMonitor-Server" },
      timeout: 5000,
    });
    const zipAsset = data.assets?.find(a => a.name.endsWith(".zip"));
    _releaseCache = {
      version: data.tag_name.replace(/^v/, ""),
      tag: data.tag_name,
      download_url: zipAsset ? `/api/plugin/download` : data.zipball_url,
      asset_url: zipAsset?.browser_download_url || null,
      filename: zipAsset?.name || `${GITHUB_REPO.split("/")[1]}-${data.tag_name}.zip`,
      size: zipAsset?.size || null,
      published_at: data.published_at,
    };
    _releaseCacheTime = now;
    res.json(_releaseCache);
  } catch (err) {
    res.status(502).json({ error: "Failed to fetch release info: " + err.message });
  }
});

router.get("/plugin/download", async (req, res) => {
  try {
    // Fetch latest release to get the asset URL
    const { data } = await axios.get(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: { Accept: "application/vnd.github.v3+json", "User-Agent": "WooMonitor-Server" },
      timeout: 5000,
    });
    const zipAsset = data.assets?.find(a => a.name.endsWith(".zip"));
    if (!zipAsset) return res.status(404).json({ error: "No ZIP asset found in latest release" });

    const filename = zipAsset.name;
    const download = await axios.get(zipAsset.browser_download_url, {
      responseType: "stream",
      timeout: 30000,
      headers: { "User-Agent": "WooMonitor-Server" },
    });

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    if (zipAsset.size) res.setHeader("Content-Length", zipAsset.size);
    download.data.pipe(res);
  } catch (err) {
    res.status(502).json({ error: "Download failed: " + err.message });
  }
});

module.exports = router;
