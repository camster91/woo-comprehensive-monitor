require("dotenv").config();
const { initDB, backupDB } = require("./db");
const { createApp } = require("./app");
const cron = require("node-cron");
const fs = require("fs");
const path = require("path");
const { checkAllStores, checkSilentStores } = require("./services/health-checker");
const { cleanupExpired } = require("./services/auth-service");
const { clearAlerts } = require("./services/alert-service");

const PORT = process.env.PORT || 3000;

async function start() {
  // initDB is now synchronous (better-sqlite3 vs sql.js)
  initDB();

  // Auto-migrate from sites.json on first boot
  const fs = require("fs");
  const path = require("path");
  const storeService = require("./services/store-service");
  const stores = storeService.getAllStores();
  const sitesPath = path.join(__dirname, "../sites.json");
  if (stores.length === 0 && fs.existsSync(sitesPath)) {
    try {
      const sites = JSON.parse(fs.readFileSync(sitesPath, "utf8"));
      console.log(`[Migration] Importing ${sites.length} stores from sites.json...`);
      sites.forEach((site) => {
        storeService.upsertStore({
          id: site.id,
          name: site.name,
          url: site.url,
          consumerKey: site.consumerKey,
          consumerSecret: site.consumerSecret,
          pluginVersion: site.plugin_version,
          woocommerceVersion: site.woocommerce_version,
          wordpressVersion: site.wordpress_version,
          phpVersion: site.php_version,
        });
      });
      console.log(`[Migration] Done. ${sites.length} stores imported.`);
    } catch (err) {
      console.error("[Migration] Failed:", err.message);
    }
  }

  const app = createApp();

  // Health checks every 15 minutes — staggered, not all at once
  let _healthRunning = false;
  cron.schedule("*/15 * * * *", async () => {
    if (_healthRunning) { console.log("[Health] Skipping — previous run still active"); return; }
    _healthRunning = true;
    try { await checkAllStores(); } finally { _healthRunning = false; }
  });

  // Silent-store detection every hour (separate from WooCommerce API health checks)
  cron.schedule("0 * * * *", () => checkSilentStores().catch(e => console.error("[Silent]", e.message)));

  // Revenue sync every 30 minutes
  const { syncAllStores: syncRevenue } = require("./services/revenue-service");
  cron.schedule("*/30 * * * *", () => {
    syncRevenue().catch(e => console.error("[Revenue]", e.message));
  });

  // Cleanup expired auth tokens daily at 3am
  cron.schedule("0 3 * * *", () => cleanupExpired());

  // Prune old alerts daily at 3:15am — keep last 30 days, hard cap 10,000 rows
  cron.schedule("15 3 * * *", () => {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const pruned = clearAlerts({ olderThan: cutoff });
    if (pruned > 0) console.log(`[Alerts] Pruned ${pruned} alerts older than 30 days`);

    // Hard cap: if still > 10000 rows, trim the oldest
    const { get: dbGet, run: dbRun } = require("./db");
    const count = dbGet("SELECT COUNT(*) as c FROM alerts");
    if (count && count.c > 10000) {
      dbRun("DELETE FROM alerts WHERE id IN (SELECT id FROM alerts ORDER BY timestamp ASC LIMIT ?)", [count.c - 10000]);
      console.log(`[Alerts] Hard cap: trimmed ${count.c - 10000} oldest rows to stay under 10,000`);
    }
  });

  // Daily SQLite backup at 2am — keeps 7 rolling daily copies in /data/backups/
  cron.schedule("0 2 * * *", () => {
    const dataDir = path.join(__dirname, "../../data");
    const backupDir = path.join(dataDir, "backups");
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

    const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const dest = path.join(backupDir, `woo-monitor-${date}.db`);
    const ok = backupDB(dest);
    if (ok) console.log(`[Backup] DB backed up → ${dest}`);

    // Retain only the 7 most-recent daily backups
    try {
      const files = fs.readdirSync(backupDir)
        .filter(f => f.startsWith("woo-monitor-") && f.endsWith(".db"))
        .sort(); // ISO date sort = chronological
      while (files.length > 7) {
        fs.unlinkSync(path.join(backupDir, files.shift()));
      }
    } catch (e) { console.error("[Backup] Cleanup error:", e.message); }
  });

  app.listen(PORT, () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "../package.json"), "utf8"));
    console.log(`Woo Monitor v${pkg.version} listening on port ${PORT}`);
    console.log(`  Dashboard: http://localhost:${PORT}/`);

    // Delay initial health check to avoid slamming all 25 stores 5s after boot
    setTimeout(() => checkAllStores(), 30 * 1000);

    // Initial revenue sync 60s after boot
    setTimeout(() => syncRevenue().catch(e => console.error("[Revenue]", e.message)), 60 * 1000);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
