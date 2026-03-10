const { Router } = require("express");
const storeService = require("../services/store-service");
const alertService = require("../services/alert-service");
const { all } = require("../db");

const router = Router();

router.get("/dashboard", (req, res) => {
  const stores = storeService.getAllStores();
  const { alerts: recentAlerts, total: totalAlerts } = alertService.getAlerts({ limit: 100 });
  const stats = alertService.getAlertStats();

  const enhancedStores = stores.map(store => {
    const storeStats = storeService.getStoreStats(store.id);
    const lastSeen = store.last_seen ? new Date(store.last_seen) : null;
    const hoursAgo = lastSeen ? (Date.now() - lastSeen.getTime()) / (1000 * 60 * 60) : Infinity;
    let healthStatus = "unknown";
    if (hoursAgo < 2) healthStatus = "excellent";
    else if (hoursAgo < 24) healthStatus = "good";
    else if (hoursAgo < 72) healthStatus = "warning";
    else if (lastSeen) healthStatus = "critical";

    return {
      id: store.id, name: store.name, url: store.url,
      hasApiCredentials: !!(store.consumer_key && store.consumer_secret),
      plugin_version: store.plugin_version || "unknown",
      woocommerce_version: store.woocommerce_version || "unknown",
      last_seen: store.last_seen,
      health_status: healthStatus,
      features: storeStats?.features || {},
      alert_counts: {
        total: storeStats?.error_counts?.total || 0,
        errors: storeStats?.error_counts?.errors || 0,
        disputes: storeStats?.error_counts?.disputes || 0,
      },
    };
  });

  // Health distribution
  const healthDistribution = { excellent: 0, good: 0, warning: 0, critical: 0, unknown: 0 };
  enhancedStores.forEach(s => healthDistribution[s.health_status]++);

  // Alert trends (7 days)
  const alertTrends = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split("T")[0];
    const rows = all(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN severity='critical' THEN 1 ELSE 0 END) as critical,
              SUM(CASE WHEN severity='high' THEN 1 ELSE 0 END) as high,
              SUM(CASE WHEN severity='medium' THEN 1 ELSE 0 END) as medium
       FROM alerts WHERE date(timestamp) = ?`,
      [dateStr]
    );
    const row = rows[0] || { total: 0, critical: 0, high: 0, medium: 0 };
    alertTrends.push({ date: dateStr, total: row.total, critical: row.critical, high: row.high, medium: row.medium });
  }

  res.json({
    status: "ok",
    version: "3.0.0",
    overview: {
      totalSites: stores.length,
      totalAlerts,
      criticalAlerts: stats.bySeverity.critical || 0,
      highAlerts: stats.bySeverity.high || 0,
      mediumAlerts: stats.bySeverity.medium || 0,
      healthDistribution,
      storesWithApi: stores.filter(s => s.consumer_key && s.consumer_secret).length,
      alertTrends,
      uptime: process.uptime(),
    },
    stores: enhancedStores,
    recentAlerts,
  });
});

module.exports = router;
