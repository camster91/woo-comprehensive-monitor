require("dotenv").config();
const { initDB } = require("./db");
const { createApp } = require("./app");
const cron = require("node-cron");
const { checkAllStores } = require("./services/health-checker");
const { cleanupExpired } = require("./services/auth-service");

const PORT = process.env.PORT || 3000;

async function start() {
  await initDB();

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
      sites.forEach(site => {
        storeService.upsertStore({
          id: site.id, name: site.name, url: site.url,
          consumerKey: site.consumerKey, consumerSecret: site.consumerSecret,
          pluginVersion: site.plugin_version, woocommerceVersion: site.woocommerce_version,
          wordpressVersion: site.wordpress_version, phpVersion: site.php_version,
        });
      });
      console.log(`[Migration] Done. ${sites.length} stores imported.`);
    } catch (err) {
      console.error("[Migration] Failed:", err.message);
    }
  }

  const app = createApp();

  // Health checks every 15 minutes
  cron.schedule("*/15 * * * *", () => checkAllStores());

  // Cleanup expired tokens daily at 3am
  cron.schedule("0 3 * * *", () => cleanupExpired());

  app.listen(PORT, () => {
    console.log(`Woo Monitor v3.0.0 listening on port ${PORT}`);
    console.log(`Dashboard: http://localhost:${PORT}/dashboard`);
    // Run initial health check after 5s
    setTimeout(() => checkAllStores(), 5000);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
