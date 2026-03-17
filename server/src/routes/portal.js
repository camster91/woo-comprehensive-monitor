const { Router } = require("express");
const portalService = require("../services/portal-service");
const { portalAuthMiddleware } = require("../middleware/portal-auth");
const revenueService = require("../services/revenue-service");
const disputeService = require("../services/dispute-service");
const alertService = require("../services/alert-service");
const storeService = require("../services/store-service");

const router = Router();

// Public: portal login (no auth required)
router.post("/portal/login", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password required" });

  const result = portalService.authenticatePortal(email, password);
  if (!result) return res.status(401).json({ error: "Invalid email or password" });

  res.json({ status: "ok", token: result.token, user: result.user });
});

// Public: portal logout
router.post("/portal/logout", (req, res) => {
  const token = req.headers["x-portal-token"];
  if (token) portalService.logoutPortal(token);
  res.json({ status: "ok" });
});

// Protected portal routes
router.get("/portal/dashboard", portalAuthMiddleware, (req, res) => {
  const user = req.portalUser;
  const store = storeService.getStore(user.store_id);
  const revenue = revenueService.getRevenueSummary("7d", user.store_id);
  const { disputes, total: disputeTotal } = disputeService.getDisputes({ storeId: user.store_id, limit: 10 });
  const stats = disputeService.getDisputeStats();

  res.json({
    status: "ok",
    user: { name: user.name, email: user.email },
    store: { name: user.store_name, url: user.store_url },
    revenue,
    disputes: { items: disputes, total: disputeTotal },
  });
});

router.get("/portal/revenue", portalAuthMiddleware, (req, res) => {
  const period = req.query.period || "7d";
  const summary = revenueService.getRevenueSummary(period, req.portalUser.store_id);
  res.json({ status: "ok", ...summary });
});

router.get("/portal/disputes", portalAuthMiddleware, (req, res) => {
  const { limit, offset } = req.query;
  const result = disputeService.getDisputes({
    storeId: req.portalUser.store_id,
    limit: parseInt(limit) || 50,
    offset: parseInt(offset) || 0,
  });
  res.json(result);
});

router.get("/portal/alerts", portalAuthMiddleware, (req, res) => {
  const { alerts, total } = alertService.getAlerts({
    storeId: req.portalUser.store_id,
    limit: parseInt(req.query.limit) || 50,
    offset: parseInt(req.query.offset) || 0,
  });
  res.json({ alerts, total });
});

// Admin routes for managing portal users (uses existing admin auth)
router.get("/portal-users", (req, res) => {
  const users = portalService.listPortalUsers();
  res.json({ status: "ok", users });
});

router.post("/portal-users", (req, res) => {
  const { storeId, email, name, password } = req.body;
  if (!storeId || !email || !password) return res.status(400).json({ error: "storeId, email, and password required" });
  try {
    const user = portalService.createPortalUser({ storeId, email, name, password });
    res.json({ status: "ok", ...user });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete("/portal-users/:id", (req, res) => {
  portalService.deletePortalUser(parseInt(req.params.id));
  res.json({ status: "ok" });
});

module.exports = router;
