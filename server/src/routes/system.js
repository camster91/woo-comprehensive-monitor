const { Router } = require("express");
const storeService = require("../services/store-service");
const alertService = require("../services/alert-service");
const { checkAllStores } = require("../services/health-checker");
const authService = require("../services/auth-service");

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

module.exports = router;
