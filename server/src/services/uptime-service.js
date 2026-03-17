const https = require("https");
const axios = require("axios");
const pLimit = require("p-limit");
const { run, get, all } = require("../db");
const storeService = require("./store-service");
const { createAlert } = require("./alert-service");

let _checkRunning = false;

async function checkStore(store) {
  const start = Date.now();
  let status_code = 0;
  let response_time_ms = 0;
  let ssl_expiry_date = null;
  let ssl_days_remaining = null;

  // HTTP check
  try {
    const res = await axios.head(store.url, { timeout: 15000, maxRedirects: 3, validateStatus: () => true });
    status_code = res.status;
    response_time_ms = Date.now() - start;
  } catch (err) {
    status_code = 0;
    response_time_ms = Date.now() - start;
  }

  // SSL check
  try {
    const url = new URL(store.url);
    if (url.protocol === "https:") {
      ssl_expiry_date = await new Promise((resolve, reject) => {
        const req = https.request({ hostname: url.hostname, port: 443, method: "HEAD", timeout: 5000 }, (res) => {
          const cert = res.socket.getPeerCertificate();
          if (cert && cert.valid_to) {
            resolve(cert.valid_to);
          } else {
            resolve(null);
          }
          res.destroy();
        });
        req.on("error", () => resolve(null));
        req.on("timeout", () => { req.destroy(); resolve(null); });
        req.end();
      });
      if (ssl_expiry_date) {
        const expiry = new Date(ssl_expiry_date);
        ssl_days_remaining = Math.ceil((expiry - Date.now()) / 86400000);
        ssl_expiry_date = expiry.toISOString().split("T")[0];
      }
    }
  } catch (err) {
    // SSL check failed, non-critical
  }

  return { store_id: store.id, status_code, response_time_ms, ssl_expiry_date, ssl_days_remaining };
}

async function checkAllStores() {
  if (_checkRunning) return { skipped: true };
  _checkRunning = true;

  try {
    const stores = storeService.getAllStores();
    const limit = pLimit(5);
    const results = [];

    await Promise.all(stores.map(store => limit(async () => {
      try {
        const check = await checkStore(store);
        run(
          `INSERT INTO uptime_checks (store_id, status_code, response_time_ms, ssl_expiry_date, ssl_days_remaining)
           VALUES (?, ?, ?, ?, ?)`,
          [check.store_id, check.status_code, check.response_time_ms, check.ssl_expiry_date, check.ssl_days_remaining]
        );
        results.push(check);

        // Create alerts
        if (check.status_code === 0 || check.status_code >= 500) {
          createAlert({
            subject: `SITE DOWN: ${store.name}`,
            message: `${store.url} returned status ${check.status_code}. Response time: ${check.response_time_ms}ms`,
            storeId: store.id, severity: "critical", type: "uptime",
            dedupKey: `down_${store.id}`,
          });
        }
        if (check.ssl_days_remaining !== null && check.ssl_days_remaining < 14) {
          createAlert({
            subject: `SSL EXPIRING: ${store.name}`,
            message: `SSL certificate for ${store.url} expires in ${check.ssl_days_remaining} days (${check.ssl_expiry_date})`,
            storeId: store.id, severity: check.ssl_days_remaining < 3 ? "critical" : "high", type: "ssl",
            dedupKey: `ssl_${store.id}`,
          });
        }
        if (check.response_time_ms > 5000 && check.status_code > 0) {
          createAlert({
            subject: `SLOW RESPONSE: ${store.name}`,
            message: `${store.url} took ${check.response_time_ms}ms to respond`,
            storeId: store.id, severity: "medium", type: "performance",
            dedupKey: `slow_${store.id}`,
          });
        }
      } catch (err) {
        console.error(`[Uptime] Check failed for ${store.name}: ${err.message}`);
      }
    })));

    // Prune old checks (keep 7 days)
    run("DELETE FROM uptime_checks WHERE checked_at < datetime('now', '-7 days')", []);

    console.log(`[Uptime] Checked ${results.length} stores`);
    return { checked: results.length };
  } finally {
    _checkRunning = false;
  }
}

function getUptimeSummary() {
  const stores = storeService.getAllStores();
  const summary = [];

  for (const store of stores) {
    const latest = get(
      "SELECT * FROM uptime_checks WHERE store_id = ? ORDER BY checked_at DESC LIMIT 1",
      [store.id]
    );
    const totalChecks = get(
      "SELECT COUNT(*) as total FROM uptime_checks WHERE store_id = ? AND checked_at >= datetime('now', '-24 hours')",
      [store.id]
    )?.total || 0;
    const upChecks = get(
      "SELECT COUNT(*) as up FROM uptime_checks WHERE store_id = ? AND checked_at >= datetime('now', '-24 hours') AND status_code >= 200 AND status_code < 400",
      [store.id]
    )?.up || 0;

    summary.push({
      store_id: store.id,
      store_name: store.name,
      store_url: store.url,
      status_code: latest?.status_code || null,
      response_time_ms: latest?.response_time_ms || null,
      ssl_expiry_date: latest?.ssl_expiry_date || null,
      ssl_days_remaining: latest?.ssl_days_remaining || null,
      uptime_24h: totalChecks > 0 ? parseFloat(((upChecks / totalChecks) * 100).toFixed(1)) : null,
      last_checked: latest?.checked_at || null,
    });
  }

  const up = summary.filter(s => s.status_code && s.status_code >= 200 && s.status_code < 400).length;
  const down = summary.filter(s => s.status_code === 0 || (s.status_code && s.status_code >= 500)).length;
  const avgResponse = summary.filter(s => s.response_time_ms).reduce((sum, s) => sum + s.response_time_ms, 0) / (summary.filter(s => s.response_time_ms).length || 1);
  const sslWarnings = summary.filter(s => s.ssl_days_remaining !== null && s.ssl_days_remaining < 30).length;

  return { up, down, unknown: summary.length - up - down, avgResponse: Math.round(avgResponse), sslWarnings, stores: summary };
}

function getSSLStatus() {
  const summary = getUptimeSummary();
  return summary.stores
    .filter(s => s.ssl_expiry_date)
    .sort((a, b) => (a.ssl_days_remaining || 999) - (b.ssl_days_remaining || 999));
}

function getVersions() {
  const stores = storeService.getAllStores();
  return stores.map(s => ({
    store_name: s.name,
    wp_version: s.wordpress_version || "unknown",
    wc_version: s.woocommerce_version || "unknown",
    plugin_version: s.plugin_version || "unknown",
  }));
}

module.exports = { checkStore, checkAllStores, getUptimeSummary, getSSLStatus, getVersions };
