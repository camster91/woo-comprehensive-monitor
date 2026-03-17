const { Router } = require("express");
const settingsService = require("../services/settings-service");
const templateService = require("../services/template-service");
const webhookService = require("../services/webhook-service");

const router = Router();

// App settings
router.get("/settings", (req, res) => {
  res.json({ settings: settingsService.getAllSettings() });
});

router.post("/settings", (req, res) => {
  const { key, value } = req.body;
  if (!key) return res.status(400).json({ error: "Key required" });
  settingsService.setSetting(key, value);
  res.json({ status: "ok" });
});

// Dispute templates
router.get("/templates", (req, res) => {
  const reason = req.query.reason;
  res.json({ templates: templateService.getTemplates({ reason }) });
});

router.get("/templates/:id", (req, res) => {
  const t = templateService.getTemplate(parseInt(req.params.id));
  if (!t) return res.status(404).json({ error: "Template not found" });
  res.json(t);
});

router.post("/templates", (req, res) => {
  const { name, reason, evidenceText } = req.body;
  if (!name || !reason || !evidenceText) return res.status(400).json({ error: "name, reason, and evidenceText required" });
  const id = templateService.createTemplate({ name, reason, evidenceText });
  res.json({ status: "ok", id });
});

router.patch("/templates/:id", (req, res) => {
  templateService.updateTemplate(parseInt(req.params.id), req.body);
  res.json({ status: "ok" });
});

router.delete("/templates/:id", (req, res) => {
  templateService.deleteTemplate(parseInt(req.params.id));
  res.json({ status: "ok" });
});

// Webhooks
router.get("/webhooks", (req, res) => {
  res.json({ webhooks: webhookService.getWebhooks() });
});

router.post("/webhooks", (req, res) => {
  const { name, url, platform, events } = req.body;
  if (!name || !url) return res.status(400).json({ error: "name and url required" });
  const id = webhookService.createWebhook({ name, url, platform, events });
  res.json({ status: "ok", id });
});

router.patch("/webhooks/:id", (req, res) => {
  webhookService.updateWebhook(parseInt(req.params.id), req.body);
  res.json({ status: "ok" });
});

router.delete("/webhooks/:id", (req, res) => {
  webhookService.deleteWebhook(parseInt(req.params.id));
  res.json({ status: "ok" });
});

module.exports = router;
