const { Router } = require("express");
const alertService = require("../services/alert-service");

const router = Router();

router.get("/dashboard/alerts", (req, res) => {
  const { storeId, severity, type, limit, offset } = req.query;
  const result = alertService.getAlerts({
    storeId, severity, type,
    limit: parseInt(limit) || 100,
    offset: parseInt(offset) || 0,
  });
  res.json(result);
});

router.post("/dashboard/clear-alerts", (req, res) => {
  const cleared = alertService.clearAlerts(req.body);
  res.json({ status: "ok", cleared });
});

router.post("/dashboard/clear-old-alerts", (req, res) => {
  const days = req.body.days || 30;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const cleared = alertService.clearAlerts({ olderThan: cutoff });
  res.json({ status: "ok", cleared, message: `Cleared alerts older than ${days} days` });
});

router.delete("/dashboard/alerts/:id", (req, res) => {
  alertService.deleteAlert(req.params.id);
  res.json({ success: true });
});

module.exports = router;
