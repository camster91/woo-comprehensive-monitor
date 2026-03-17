const { Router } = require("express");
const { all } = require("../db");

const router = Router();

router.get("/search", (req, res) => {
  const q = (req.query.q || "").trim();
  if (!q || q.length < 2) return res.json({ results: [] });

  const like = `%${q}%`;

  // Search stores
  const stores = all(
    "SELECT id, name, url, 'store' as result_type FROM stores WHERE name LIKE ? OR url LIKE ? LIMIT 5",
    [like, like]
  ).map(s => ({ ...s, link: "/stores" }));

  // Search alerts
  const alerts = all(
    "SELECT id, subject as name, message as detail, severity, 'alert' as result_type FROM alerts WHERE subject LIKE ? OR message LIKE ? ORDER BY timestamp DESC LIMIT 5",
    [like, like]
  ).map(a => ({ ...a, link: "/alerts" }));

  // Search disputes
  const disputes = all(
    "SELECT id, customer_name as name, customer_email as detail, stripe_dispute_id, reason, 'dispute' as result_type FROM disputes WHERE customer_name LIKE ? OR customer_email LIKE ? OR stripe_dispute_id LIKE ? ORDER BY created_at DESC LIMIT 5",
    [like, like, like]
  ).map(d => ({ ...d, link: "/disputes" }));

  // Search tickets
  const tickets = all(
    "SELECT id, subject as name, message as detail, status, 'ticket' as result_type FROM tickets WHERE subject LIKE ? OR message LIKE ? ORDER BY created_at DESC LIMIT 5",
    [like, like]
  ).map(t => ({ ...t, link: "/tickets" }));

  res.json({
    results: [...stores, ...alerts, ...disputes, ...tickets],
    query: q,
  });
});

module.exports = router;
