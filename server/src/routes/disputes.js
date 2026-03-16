const { Router } = require("express");
const axios = require("axios");
const disputeService = require("../services/dispute-service");
const { getAllStores } = require("../services/store-service");

const router = Router();

router.get("/disputes", (req, res) => {
  const { storeId, status, limit, offset } = req.query;
  const result = disputeService.getDisputes({
    storeId: storeId || undefined,
    status: status || undefined,
    limit: parseInt(limit) || 50,
    offset: parseInt(offset) || 0,
  });
  res.json(result);
});

router.get("/disputes/stats", (req, res) => {
  res.json(disputeService.getDisputeStats());
});

router.get("/disputes/:id", (req, res) => {
  const dispute = disputeService.getDispute(parseInt(req.params.id));
  if (!dispute) return res.status(404).json({ error: "Dispute not found" });
  res.json(dispute);
});

router.delete("/disputes/:id", (req, res) => {
  disputeService.deleteDispute(parseInt(req.params.id));
  res.json({ success: true });
});

// Trigger historical dispute sync on all connected stores
router.post("/disputes/sync", async (req, res) => {
  const stores = getAllStores();
  const results = [];

  for (const store of stores) {
    if (!store.consumer_key || !store.consumer_secret) {
      results.push({ store: store.name, status: "skipped", reason: "No API credentials" });
      continue;
    }

    try {
      // Call the plugin's REST endpoint to trigger sync
      const authHeader = "Basic " + Buffer.from(`${store.consumer_key}:${store.consumer_secret}`).toString("base64");
      const { data } = await axios.post(
        `${store.url}/wp-json/wcm/v1/sync-disputes`,
        {},
        {
          headers: { Authorization: authHeader },
          timeout: 120000, // 2 min — historical sync can take a while
        }
      );
      results.push({ store: store.name, status: "ok", result: data.result || data });
    } catch (err) {
      results.push({ store: store.name, status: "error", error: err.message });
    }
  }

  res.json({ success: true, results });
});

module.exports = router;
