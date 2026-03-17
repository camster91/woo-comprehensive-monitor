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

  // Auto-submit dispute evidence every 15 min (offset from health check)
  const { getDueForAutoSubmit, clearAutoSubmit } = require("./services/dispute-service");
  const { createAlert } = require("./services/alert-service");
  let _autoSubmitRunning = false;
  cron.schedule("5,20,35,50 * * * *", async () => {
    if (_autoSubmitRunning) return;
    _autoSubmitRunning = true;
    try {
      const due = getDueForAutoSubmit();
      for (const dispute of due) {
        if (!dispute.consumer_key || !dispute.consumer_secret || !dispute.store_api_url) {
          console.log(`[AutoSubmit] Skipping ${dispute.stripe_dispute_id} — no store credentials`);
          continue;
        }
        try {
          await require("axios").post(
            `${dispute.store_api_url}/wp-json/wcm/v1/disputes/${dispute.stripe_dispute_id}/submit?consumer_key=${encodeURIComponent(dispute.consumer_key)}&consumer_secret=${encodeURIComponent(dispute.consumer_secret)}`,
            {},
            { timeout: 30000 }
          );
          clearAutoSubmit(dispute.id);
          console.log(`[AutoSubmit] Submitted evidence for ${dispute.stripe_dispute_id}`);
          // V2: Notify + log
          try {
            const { notifyAdmin } = require("./services/notification-service");
            const { logActivity } = require("./services/activity-service");
            const { queueAlertEmail } = require("./services/alert-service");
            notifyAdmin(`Evidence submitted: ${dispute.stripe_dispute_id}`, `Auto-submitted for ${dispute.store_name}`, "success", "/disputes");
            logActivity({ storeId: dispute.store_id, eventType: "dispute", title: `Evidence auto-submitted: ${dispute.stripe_dispute_id}`, severity: "success" });
            queueAlertEmail(`Evidence Auto-Submitted: ${dispute.stripe_dispute_id}`, `Dispute evidence was auto-submitted for ${dispute.store_name}.\n\nDispute: ${dispute.stripe_dispute_id}`, dispute.store_id, "dispute");
          } catch (_) {}
        } catch (err) {
          console.error(`[AutoSubmit] Failed ${dispute.stripe_dispute_id}: ${err.message}`);
          createAlert({
            subject: `Auto-submit failed: ${dispute.stripe_dispute_id}`,
            message: `Failed to auto-submit evidence for dispute ${dispute.stripe_dispute_id} on ${dispute.store_name}. Error: ${err.message}`,
            storeId: dispute.store_id,
            severity: "high",
            type: "dispute",
          });
        }
      }
    } finally {
      _autoSubmitRunning = false;
    }
  });

  // Uptime checks every 5 minutes (offset to :02, :07, etc.)
  const { checkAllStores: checkUptime } = require("./services/uptime-service");
  cron.schedule("2,7,12,17,22,27,32,37,42,47,52,57 * * * *", () => {
    checkUptime().catch(e => console.error("[Uptime]", e.message));
  });

  // Inventory sync every 30 minutes (piggybacks with revenue)
  const { syncAllStores: syncInventory } = require("./services/inventory-service");
  cron.schedule("*/30 * * * *", () => {
    syncInventory().catch(e => console.error("[Inventory]", e.message));
  });

  // Trigger WP-Cron on all sites every 15 minutes (staggered, sequential)
  // Sites have DISABLE_WP_CRON=true, so cron only runs when we trigger it here
  cron.schedule("*/15 * * * *", async () => {
    const stores = require("./services/store-service").getAllStores();
    const axios = require("axios");
    for (const store of stores) {
      try {
        await axios.get(`${store.url}/wp-cron.php?doing_wp_cron`, { timeout: 10000 });
      } catch (_) {}
      await new Promise(r => setTimeout(r, 2000)); // 2s gap between sites
    }
    console.log(`[WP-Cron] Triggered ${stores.length} sites`);
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

  // Weekly digest — every Monday at 9am
  const { sendWeeklyDigests } = require("./services/digest-service");
  cron.schedule("0 9 * * 1", () => {
    sendWeeklyDigests().catch(e => console.error("[Digest]", e.message));
  });

  // Prune old notifications and activity log — daily at 3:30am
  const { deleteOldNotifications } = require("./services/notification-service");
  const { pruneActivity } = require("./services/activity-service");
  cron.schedule("30 3 * * *", () => {
    deleteOldNotifications(30);
    pruneActivity(30);
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

    // Initial uptime check 90s after boot
    setTimeout(() => checkUptime().catch(e => console.error("[Uptime]", e.message)), 90 * 1000);

    // Initial inventory sync 120s after boot
    setTimeout(() => syncInventory().catch(e => console.error("[Inventory]", e.message)), 120 * 1000);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
