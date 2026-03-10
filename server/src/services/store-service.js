const { run, get, all, insert } = require("../db");

function upsertStore({ id, name, url, consumerKey, consumerSecret, pluginVersion, woocommerceVersion, wordpressVersion, phpVersion }) {
  const existing = get("SELECT id FROM stores WHERE id = ?", [id]);

  if (existing) {
    const fields = [];
    const params = [];
    if (name) { fields.push("name = ?"); params.push(name); }
    if (url) { fields.push("url = ?"); params.push(url); }
    if (consumerKey) { fields.push("consumer_key = ?"); params.push(consumerKey); }
    if (consumerSecret) { fields.push("consumer_secret = ?"); params.push(consumerSecret); }
    if (pluginVersion) { fields.push("plugin_version = ?"); params.push(pluginVersion); }
    if (woocommerceVersion) { fields.push("woocommerce_version = ?"); params.push(woocommerceVersion); }
    if (wordpressVersion) { fields.push("wordpress_version = ?"); params.push(wordpressVersion); }
    if (phpVersion) { fields.push("php_version = ?"); params.push(phpVersion); }
    fields.push("last_seen = datetime('now')");
    fields.push("updated_at = datetime('now')");
    if (fields.length) {
      run(`UPDATE stores SET ${fields.join(", ")} WHERE id = ?`, [...params, id]);
    }
    return { action: "updated", id };
  }

  run(
    `INSERT INTO stores (id, name, url, consumer_key, consumer_secret, plugin_version, woocommerce_version, wordpress_version, php_version, last_seen)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [id, name, url, consumerKey || null, consumerSecret || null, pluginVersion || null, woocommerceVersion || null, wordpressVersion || null, phpVersion || null]
  );

  // Initialize store_stats
  run("INSERT OR IGNORE INTO store_stats (store_id) VALUES (?)", [id]);

  return { action: "created", id };
}

function getAllStores() {
  return all("SELECT * FROM stores ORDER BY name");
}

function getStore(id) {
  return get("SELECT * FROM stores WHERE id = ?", [id]);
}

function removeStore(id) {
  run("DELETE FROM store_stats WHERE store_id = ?", [id]);
  const before = get("SELECT COUNT(*) as c FROM stores WHERE id = ?", [id]);
  run("DELETE FROM stores WHERE id = ?", [id]);
  return before ? before.c : 0;
}

function updateStoreSettings(id, settings) {
  run("UPDATE stores SET settings = ?, updated_at = datetime('now') WHERE id = ?",
    [JSON.stringify(settings), id]);
}

function updateStoreSyncConfig(id, syncConfig) {
  run("UPDATE stores SET sync_config = ?, updated_at = datetime('now') WHERE id = ?",
    [JSON.stringify(syncConfig), id]);
}

function updateStoreCredentials(id, consumerKey, consumerSecret) {
  run("UPDATE stores SET consumer_key = ?, consumer_secret = ?, updated_at = datetime('now') WHERE id = ?",
    [consumerKey, consumerSecret, id]);
}

function clearStoreCredentials(id) {
  run("UPDATE stores SET consumer_key = NULL, consumer_secret = NULL, updated_at = datetime('now') WHERE id = ?", [id]);
}

function getStoreStats(storeId) {
  const row = get("SELECT * FROM store_stats WHERE store_id = ?", [storeId]);
  if (!row) return null;
  return {
    ...row,
    features: JSON.parse(row.features || "{}"),
    admin_notices: JSON.parse(row.admin_notices || "[]"),
    error_counts: JSON.parse(row.error_counts || "{}"),
  };
}

function updateStoreStats(storeId, updates) {
  run("INSERT OR IGNORE INTO store_stats (store_id) VALUES (?)", [storeId]);

  const fields = [];
  const params = [];
  if (updates.features !== undefined) { fields.push("features = ?"); params.push(JSON.stringify(updates.features)); }
  if (updates.healthStatus !== undefined) { fields.push("health_status = ?"); params.push(updates.healthStatus); }
  if (updates.adminNotices !== undefined) { fields.push("admin_notices = ?"); params.push(JSON.stringify(updates.adminNotices)); }
  if (updates.errorCounts !== undefined) { fields.push("error_counts = ?"); params.push(JSON.stringify(updates.errorCounts)); }
  fields.push("updated_at = datetime('now')");

  run(`UPDATE store_stats SET ${fields.join(", ")} WHERE store_id = ?`, [...params, storeId]);
}

function touchStore(id) {
  run("UPDATE stores SET last_seen = datetime('now') WHERE id = ?", [id]);
}

module.exports = {
  upsertStore,
  getAllStores,
  getStore,
  removeStore,
  updateStoreSettings,
  updateStoreSyncConfig,
  updateStoreCredentials,
  clearStoreCredentials,
  getStoreStats,
  updateStoreStats,
  touchStore,
};
