const fs = require("fs");
const path = require("path");
const { initDB } = require("./db");
const storeService = require("./services/store-service");

const sitesPath = path.join(__dirname, "../sites.json");
if (!fs.existsSync(sitesPath)) {
  console.log("No sites.json found, nothing to migrate.");
  process.exit(0);
}

(async () => {
  await initDB();
  const sites = JSON.parse(fs.readFileSync(sitesPath, "utf8"));
  console.log(`Migrating ${sites.length} stores from sites.json...`);

  sites.forEach(site => {
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
    console.log(`  migrated: ${site.name} (${site.url})`);
  });

  console.log("Migration complete.");
  process.exit(0);
})();
