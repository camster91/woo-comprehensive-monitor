const { Router } = require("express");
const portalService = require("../services/portal-service");
const { portalAuthMiddleware } = require("../middleware/portal-auth");
const revenueService = require("../services/revenue-service");
const disputeService = require("../services/dispute-service");
const alertService = require("../services/alert-service");
const storeService = require("../services/store-service");
const ticketService = require("../services/ticket-service");

const router = Router();

// Public: request magic code
router.post("/portal/request-code", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email required" });

  const result = portalService.requestPortalCode(email);
  if (!result) return res.status(404).json({ error: "No account found for this email" });

  // Send the code via email
  const { sendEmail } = require("../services/email-service");
  await sendEmail({
    to: email,
    subject: `Your login code: ${result.code}`,
    text: `Your 6-digit login code is: ${result.code}\n\nThis code expires in 10 minutes.\n\nIf you didn't request this, you can safely ignore this email.`,
  });

  res.json({ status: "ok", message: "Code sent" });
});

// Public: verify magic code
router.post("/portal/verify-code", (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) return res.status(400).json({ error: "Email and code required" });

  const result = portalService.verifyPortalCode(email, code);
  if (!result) return res.status(401).json({ error: "Invalid or expired code" });

  res.json({ status: "ok", token: result.token, user: result.user });
});

// Legacy: portal login with password (backward compat)
router.post("/portal/login", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and code required" });

  const result = portalService.authenticatePortal(email, password);
  if (!result) return res.status(401).json({ error: "Invalid credentials" });

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

// Portal: submit a ticket
router.post("/portal/tickets", portalAuthMiddleware, (req, res) => {
  const { subject, message, priority } = req.body;
  if (!subject || !message) return res.status(400).json({ error: "Subject and message required" });
  const id = ticketService.createTicket({
    storeId: req.portalUser.store_id,
    portalUserId: req.portalUser.id,
    subject, message, priority,
  });
  res.json({ status: "ok", id });
});

// Portal: view my tickets
router.get("/portal/tickets", portalAuthMiddleware, (req, res) => {
  const result = ticketService.getTickets({
    storeId: req.portalUser.store_id,
    limit: parseInt(req.query.limit) || 50,
    offset: parseInt(req.query.offset) || 0,
  });
  res.json(result);
});

// Portal: view single ticket
router.get("/portal/tickets/:id", portalAuthMiddleware, (req, res) => {
  const ticket = ticketService.getTicket(parseInt(req.params.id));
  if (!ticket) return res.status(404).json({ error: "Ticket not found" });
  if (ticket.store_id !== req.portalUser.store_id) return res.status(403).json({ error: "Not your ticket" });
  res.json(ticket);
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

// Admin: view all tickets
router.get("/tickets", (req, res) => {
  const { storeId, status, limit, offset } = req.query;
  const result = ticketService.getTickets({
    storeId: storeId || undefined,
    status: status || undefined,
    limit: parseInt(limit) || 50,
    offset: parseInt(offset) || 0,
  });
  res.json(result);
});

// Admin: get ticket stats
router.get("/tickets/stats", (req, res) => {
  res.json(ticketService.getTicketStats());
});

// Admin: view single ticket
router.get("/tickets/:id", (req, res) => {
  const ticket = ticketService.getTicket(parseInt(req.params.id));
  if (!ticket) return res.status(404).json({ error: "Ticket not found" });
  res.json(ticket);
});

// Admin: reply to ticket
router.post("/tickets/:id/reply", (req, res) => {
  const { reply } = req.body;
  if (!reply) return res.status(400).json({ error: "Reply required" });
  ticketService.replyToTicket(parseInt(req.params.id), reply);
  res.json({ status: "ok" });
});

// Admin: update ticket status
router.patch("/tickets/:id", (req, res) => {
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: "Status required" });
  ticketService.updateTicketStatus(parseInt(req.params.id), status);
  res.json({ status: "ok" });
});

module.exports = router;
