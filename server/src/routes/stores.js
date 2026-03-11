const { Router } = require("express");
const crypto = require("crypto");
const WooCommerceRestApi = require("@woocommerce/woocommerce-rest-api").default;
const storeService = require("../services/store-service");

const router = Router();

router.get("/stores", (req, res) => {
  const stores = storeService.getAllStores();
  res.json({
    status: "ok",
    stores: stores.map(s => ({
      id: s.id, name: s.name, url: s.url,
      hasApiCredentials: !!(s.consumer_key && s.consumer_secret),
      plugin_version: s.plugin_version,
      woocommerce_version: s.woocommerce_version,
      last_seen: s.last_seen,
    })),
  });
});

router.get("/stores/:id", (req, res) => {
  const store = storeService.getStore(req.params.id);
  if (!store) return res.status(404).json({ error: "Store not found" });
  const stats = storeService.getStoreStats(req.params.id);
  res.json({
    ...store,
    consumer_key: store.consumer_key ? "••••••••" : null,
    consumer_secret: store.consumer_secret ? "••••••••" : null,
    settings: JSON.parse(store.settings || "{}"),
    sync_config: JSON.parse(store.sync_config || "{}"),
    stats,
  });
});

router.post("/stores", (req, res) => {
  const { id, name, url, consumerKey, consumerSecret } = req.body;
  if (!name || !url) return res.status(400).json({ error: "name and url required" });
  const storeId = id || `store-${crypto.randomBytes(4).toString("hex")}`;
  const result = storeService.upsertStore({ id: storeId, name, url, consumerKey, consumerSecret });
  res.json({ success: true, ...result });
});

router.post("/stores/remove", (req, res) => {
  const { storeId } = req.body;
  if (!storeId) return res.status(400).json({ error: "storeId required" });
  storeService.removeStore(storeId);
  res.json({ success: true, message: `Store ${storeId} removed` });
});

router.patch("/stores/:id", (req, res) => {
  const store = storeService.getStore(req.params.id);
  if (!store) return res.status(404).json({ error: "Store not found" });
  storeService.upsertStore({ id: req.params.id, ...req.body });
  res.json({ success: true });
});

router.patch("/stores/:id/settings", (req, res) => {
  storeService.updateStoreSettings(req.params.id, req.body);
  res.json({ success: true });
});

router.patch("/stores/:id/sync", (req, res) => {
  storeService.updateStoreSyncConfig(req.params.id, req.body);
  res.json({ success: true });
});

router.post("/stores/:id/credentials", (req, res) => {
  const { consumerKey, consumerSecret } = req.body;
  storeService.updateStoreCredentials(req.params.id, consumerKey, consumerSecret);
  res.json({ success: true });
});

router.delete("/stores/:id/credentials", (req, res) => {
  storeService.clearStoreCredentials(req.params.id);
  res.json({ success: true });
});

router.post("/stores/:id/test-api", async (req, res) => {
  const store = storeService.getStore(req.params.id);
  if (!store) return res.status(404).json({ error: "Store not found" });
  const key = req.body.consumerKey || store.consumer_key;
  const secret = req.body.consumerSecret || store.consumer_secret;
  if (!key || !secret) return res.status(400).json({ error: "No API credentials" });

  try {
    const api = new WooCommerceRestApi({ url: store.url, consumerKey: key, consumerSecret: secret, version: "wc/v3" });
    const { data } = await api.get("system_status");
    res.json({ success: true, store: store.name, woocommerce_version: data.environment?.version, message: "Connection successful" });
  } catch (err) {
    res.status(502).json({ success: false, error: err.message });
  }
});

module.exports = router;
