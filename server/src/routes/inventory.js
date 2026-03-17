const { Router } = require("express");
const inventoryService = require("../services/inventory-service");

const router = Router();

router.get("/inventory", (req, res) => {
  const summary = inventoryService.getInventorySummary();
  res.json({ status: "ok", ...summary });
});

router.get("/inventory/out-of-stock", (req, res) => {
  const products = inventoryService.getOutOfStock();
  res.json({ status: "ok", products });
});

router.get("/inventory/low-stock", (req, res) => {
  const threshold = parseInt(req.query.threshold) || 5;
  const products = inventoryService.getLowStock(threshold);
  res.json({ status: "ok", products });
});

router.get("/inventory/price-changes", (req, res) => {
  const days = parseInt(req.query.days) || 7;
  const changes = inventoryService.getPriceChanges(days);
  res.json({ status: "ok", changes });
});

router.post("/inventory/sync", async (req, res) => {
  try {
    const result = await inventoryService.syncAllStores();
    if (result.skipped) return res.json({ status: "ok", message: "Sync already in progress" });
    res.json({ status: "ok", ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
