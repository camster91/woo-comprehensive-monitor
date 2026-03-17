const { Router } = require("express");
const axios = require("axios");
const { getAllStores, getStore } = require("../services/store-service");

const router = Router();

// Helper: proxy GET to a store's WCM endpoint
async function proxyGet(storeId, endpoint) {
  const store = getStore(storeId);
  if (!store || !store.consumer_key) throw new Error("Store not found or no API keys");
  const qs = `consumer_key=${encodeURIComponent(store.consumer_key)}&consumer_secret=${encodeURIComponent(store.consumer_secret)}`;
  const { data } = await axios.get(`${store.url}/wp-json/wcm/v1/${endpoint}?${qs}`, { timeout: 30000 });
  return data;
}

// Helper: proxy POST to a store's WCM endpoint
async function proxyPost(storeId, endpoint, body = {}) {
  const store = getStore(storeId);
  if (!store || !store.consumer_key) throw new Error("Store not found or no API keys");
  const qs = `consumer_key=${encodeURIComponent(store.consumer_key)}&consumer_secret=${encodeURIComponent(store.consumer_secret)}`;
  const { data } = await axios.post(`${store.url}/wp-json/wcm/v1/${endpoint}?${qs}`, body, { timeout: 120000 });
  return data;
}

// Bulk: get update summary across ALL stores (MUST be before /:storeId routes)
router.get("/manage/updates-summary", async (req, res) => {
  const stores = getAllStores().filter(s => s.consumer_key);
  const pLimit = require("p-limit");
  const limit = pLimit(3);
  const results = [];

  await Promise.all(stores.map(store => limit(async () => {
    try {
      const qs = `consumer_key=${encodeURIComponent(store.consumer_key)}&consumer_secret=${encodeURIComponent(store.consumer_secret)}`;
      const [plugins, themes, core] = await Promise.all([
        axios.get(`${store.url}/wp-json/wcm/v1/plugins?${qs}`, { timeout: 30000 }).then(r => r.data).catch(() => null),
        axios.get(`${store.url}/wp-json/wcm/v1/themes?${qs}`, { timeout: 30000 }).then(r => r.data).catch(() => null),
        axios.get(`${store.url}/wp-json/wcm/v1/core?${qs}`, { timeout: 15000 }).then(r => r.data).catch(() => null),
      ]);

      const pluginUpdates = (plugins?.plugins || []).filter(p => p.has_update).length;
      const themeUpdates = (themes?.themes || []).filter(t => t.has_update).length;

      results.push({
        store_id: store.id,
        store_name: store.name,
        plugin_updates: pluginUpdates,
        theme_updates: themeUpdates,
        core_update: core?.has_update || false,
        wp_version: core?.current_version || "unknown",
        total_plugins: (plugins?.plugins || []).length,
        active_plugins: (plugins?.plugins || []).filter(p => p.active).length,
      });
    } catch (err) {
      results.push({ store_id: store.id, store_name: store.name, error: err.message });
    }
  })));

  const totalPluginUpdates = results.reduce((s, r) => s + (r.plugin_updates || 0), 0);
  const totalThemeUpdates = results.reduce((s, r) => s + (r.theme_updates || 0), 0);
  const coreUpdates = results.filter(r => r.core_update).length;

  res.json({
    status: "ok",
    totalPluginUpdates,
    totalThemeUpdates,
    coreUpdates,
    stores: results,
  });
});

// Bulk: update all plugins on ALL stores (MUST be before /:storeId routes)
router.post("/manage/bulk-update-all", async (req, res) => {
  const stores = getAllStores().filter(s => s.consumer_key);
  const pLimit = require("p-limit");
  const limit = pLimit(2); // Lower concurrency for updates
  const results = [];

  await Promise.all(stores.map(store => limit(async () => {
    try {
      const qs = `consumer_key=${encodeURIComponent(store.consumer_key)}&consumer_secret=${encodeURIComponent(store.consumer_secret)}`;
      const { data } = await axios.post(`${store.url}/wp-json/wcm/v1/plugins/update-all?${qs}`, {}, { timeout: 300000 });
      results.push({ store: store.name, success: true, updated: data.updated || [] });
    } catch (err) {
      results.push({ store: store.name, success: false, error: err.message });
    }
  })));

  res.json({ status: "ok", results });
});

// Get plugins for a specific store
router.get("/manage/:storeId/plugins", async (req, res) => {
  try {
    const data = await proxyGet(req.params.storeId, "plugins");
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Get themes for a specific store
router.get("/manage/:storeId/themes", async (req, res) => {
  try {
    const data = await proxyGet(req.params.storeId, "themes");
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Get core status for a specific store
router.get("/manage/:storeId/core", async (req, res) => {
  try {
    const data = await proxyGet(req.params.storeId, "core");
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Update a plugin on a store
router.post("/manage/:storeId/plugins/update", async (req, res) => {
  try {
    const data = await proxyPost(req.params.storeId, "plugins/update", { plugin: req.body.plugin });
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Update all plugins on a store
router.post("/manage/:storeId/plugins/update-all", async (req, res) => {
  try {
    const data = await proxyPost(req.params.storeId, "plugins/update-all");
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Toggle plugin (activate/deactivate)
router.post("/manage/:storeId/plugins/toggle", async (req, res) => {
  try {
    const data = await proxyPost(req.params.storeId, "plugins/toggle", {
      plugin: req.body.plugin,
      action: req.body.action,
    });
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Install a plugin from WordPress.org
router.post("/manage/:storeId/plugins/install", async (req, res) => {
  try {
    const data = await proxyPost(req.params.storeId, "plugins/install", {
      slug: req.body.slug,
      activate: req.body.activate || "true",
    });
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Update a theme
router.post("/manage/:storeId/themes/update", async (req, res) => {
  try {
    const data = await proxyPost(req.params.storeId, "themes/update", { theme: req.body.theme });
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Update WP core
router.post("/manage/:storeId/core/update", async (req, res) => {
  try {
    const data = await proxyPost(req.params.storeId, "core/update");
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
