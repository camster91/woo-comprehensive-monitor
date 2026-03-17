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

router.get("/disputes/analytics", (req, res) => {
  const period = req.query.period || "30d";
  const analytics = disputeService.getDisputeAnalytics(period);
  res.json({ status: "ok", ...analytics });
});

router.get("/disputes/deadlines", (req, res) => {
  const deadlines = disputeService.getUpcomingDeadlines();
  res.json({ status: "ok", deadlines });
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

router.post("/disputes/:id/hold", (req, res) => {
  const dispute = disputeService.getDispute(parseInt(req.params.id));
  if (!dispute) return res.status(404).json({ error: "Dispute not found" });
  disputeService.setHold(dispute.id, 1);
  res.json({ success: true, message: "Auto-submit paused" });
});

router.post("/disputes/:id/release", (req, res) => {
  const dispute = disputeService.getDispute(parseInt(req.params.id));
  if (!dispute) return res.status(404).json({ error: "Dispute not found" });
  disputeService.setHold(dispute.id, 0);
  res.json({ success: true, message: "Auto-submit resumed, will submit in 24h" });
});

// Get evidence preview for a dispute (proxies to the store's REST API)
router.get("/disputes/:id/evidence", async (req, res) => {
  const dispute = disputeService.getDispute(parseInt(req.params.id));
  if (!dispute) return res.status(404).json({ error: "Dispute not found" });
  if (!dispute.stripe_dispute_id) return res.status(400).json({ error: "No Stripe dispute ID" });

  // Find the store to proxy the request
  const stores = getAllStores();
  const store = stores.find(s => s.id === dispute.store_id) ||
    stores.find(s => dispute.store_url && s.url && dispute.store_url.includes(s.url));

  if (!store || !store.consumer_key || !store.consumer_secret) {
    return res.json({ dispute_id: dispute.stripe_dispute_id, evidence: null, error: "Store credentials not configured" });
  }

  try {
    const authHeader = "Basic " + Buffer.from(`${store.consumer_key}:${store.consumer_secret}`).toString("base64");
    const { data } = await axios.get(
      `${store.url}/wp-json/wcm/v1/disputes/${dispute.stripe_dispute_id}/evidence`,
      { headers: { Authorization: authHeader }, timeout: 15000 }
    );
    res.json(data);
  } catch (err) {
    res.json({ dispute_id: dispute.stripe_dispute_id, evidence: null, error: err.message });
  }
});

// Submit evidence to Stripe via the store's REST API
router.post("/disputes/:id/submit", async (req, res) => {
  const dispute = disputeService.getDispute(parseInt(req.params.id));
  if (!dispute) return res.status(404).json({ error: "Dispute not found" });

  const stores = getAllStores();
  const store = stores.find(s => s.id === dispute.store_id) ||
    stores.find(s => dispute.store_url && s.url && dispute.store_url.includes(s.url));

  if (!store || !store.consumer_key || !store.consumer_secret) {
    return res.status(400).json({ error: "Store credentials not configured" });
  }

  try {
    const authHeader = "Basic " + Buffer.from(`${store.consumer_key}:${store.consumer_secret}`).toString("base64");
    const { data } = await axios.post(
      `${store.url}/wp-json/wcm/v1/disputes/${dispute.stripe_dispute_id}/submit`,
      {},
      { headers: { Authorization: authHeader }, timeout: 30000 }
    );

    // Update dispute status in our DB
    disputeService.upsertDispute({
      stripeDisputeId: dispute.stripe_dispute_id,
      evidenceGenerated: true,
      metadata: { ...dispute.metadata, evidence_submitted: true, submitted_at: new Date().toISOString() },
    });

    disputeService.clearAutoSubmit(dispute.id);

    res.json({ success: true, result: data });
  } catch (err) {
    res.status(502).json({ error: "Submission failed: " + err.message });
  }
});

// Stage evidence on a dispute (for disputes not yet auto-staged)
router.post("/disputes/:id/stage", async (req, res) => {
  const dispute = disputeService.getDispute(parseInt(req.params.id));
  if (!dispute) return res.status(404).json({ error: "Dispute not found" });

  const stores = getAllStores();
  const store = stores.find(s => s.id === dispute.store_id) ||
    stores.find(s => dispute.store_url && s.url && dispute.store_url.includes(s.url));

  if (!store || !store.consumer_key || !store.consumer_secret) {
    return res.status(400).json({ error: "Store credentials not configured" });
  }

  try {
    const authHeader = "Basic " + Buffer.from(`${store.consumer_key}:${store.consumer_secret}`).toString("base64");
    const { data } = await axios.post(
      `${store.url}/wp-json/wcm/v1/disputes/${dispute.stripe_dispute_id}/stage`,
      {},
      { headers: { Authorization: authHeader }, timeout: 30000 }
    );

    disputeService.upsertDispute({
      stripeDisputeId: dispute.stripe_dispute_id,
      evidenceGenerated: true,
      metadata: { ...dispute.metadata, evidence_staged: true, staged_at: new Date().toISOString() },
    });

    res.json({ success: true, result: data });
  } catch (err) {
    res.status(502).json({ error: "Staging failed: " + err.message });
  }
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
