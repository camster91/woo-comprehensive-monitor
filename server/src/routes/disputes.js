const { Router } = require("express");
const disputeService = require("../services/dispute-service");

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

module.exports = router;
