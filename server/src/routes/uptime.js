const { Router } = require("express");
const uptimeService = require("../services/uptime-service");

const router = Router();

router.get("/uptime", (req, res) => {
  const summary = uptimeService.getUptimeSummary();
  res.json({ status: "ok", ...summary });
});

router.get("/uptime/ssl", (req, res) => {
  const ssl = uptimeService.getSSLStatus();
  res.json({ status: "ok", stores: ssl });
});

router.get("/uptime/versions", (req, res) => {
  const versions = uptimeService.getVersions();
  res.json({ status: "ok", versions });
});

router.post("/uptime/check", async (req, res) => {
  try {
    const result = await uptimeService.checkAllStores();
    res.json({ status: "ok", ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
