const { Router } = require("express");
const revenueService = require("../services/revenue-service");

const router = Router();

router.get("/revenue", (req, res) => {
  const period = req.query.period || "7d";
  const storeId = req.query.store || null;
  const summary = revenueService.getRevenueSummary(period, storeId);
  res.json({ status: "ok", ...summary });
});

router.get("/revenue/timeline", (req, res) => {
  const days = parseInt(req.query.days) || 7;
  const storeId = req.query.store || null;
  const timeline = revenueService.getRevenueTimeline(Math.min(days, 365), storeId);
  res.json({ status: "ok", timeline });
});

router.get("/revenue/stores", (req, res) => {
  const period = req.query.period || "7d";
  const stores = revenueService.getRevenueByStore(period);
  res.json({ status: "ok", stores });
});

router.get("/revenue/failed", (req, res) => {
  const days = parseInt(req.query.days) || 7;
  const storeId = req.query.store || null;
  const data = revenueService.getFailedPayments(Math.min(days, 365), storeId);
  res.json({ status: "ok", data });
});

router.post("/revenue/sync", async (req, res) => {
  try {
    const result = await revenueService.syncAllStores();
    if (result.skipped) {
      return res.json({ status: "ok", message: "Sync already in progress" });
    }
    res.json({ status: "ok", ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
