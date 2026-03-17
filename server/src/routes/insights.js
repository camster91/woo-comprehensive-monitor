const { Router } = require("express");
const { all, get } = require("../db");

const router = Router();

router.get("/insights", (req, res) => {
  const insights = [];

  // Dispute analysis
  const disputeStats = get(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) as won,
      SUM(CASE WHEN status = 'lost' THEN 1 ELSE 0 END) as lost,
      SUM(CASE WHEN status IN ('needs_response','warning_needs_response') THEN 1 ELSE 0 END) as pending,
      SUM(amount) as total_amount
    FROM disputes
  `);

  if (disputeStats && disputeStats.total > 0) {
    const winRate = disputeStats.won / (disputeStats.won + disputeStats.lost || 1) * 100;
    insights.push({
      type: "dispute",
      severity: winRate < 30 ? "warning" : "info",
      title: `Dispute Win Rate: ${winRate.toFixed(0)}%`,
      detail: `${disputeStats.won} won, ${disputeStats.lost} lost out of ${disputeStats.total} total. ${disputeStats.pending} pending response.`,
      suggestion: winRate < 30
        ? "Consider improving evidence quality. Use dispute templates and ensure tracking info is included."
        : "Keep up the good work on dispute evidence quality.",
    });

    // Dispute reasons breakdown
    const reasonBreakdown = all(`
      SELECT reason, COUNT(*) as count,
        SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) as won,
        SUM(CASE WHEN status = 'lost' THEN 1 ELSE 0 END) as lost
      FROM disputes
      GROUP BY reason ORDER BY count DESC LIMIT 5
    `);

    if (reasonBreakdown.length > 0) {
      const topReason = reasonBreakdown[0];
      insights.push({
        type: "dispute",
        severity: "info",
        title: `Most Common Dispute Reason: ${topReason.reason || "Unknown"}`,
        detail: reasonBreakdown.map(r => `${r.reason}: ${r.count} (${r.won}W/${r.lost}L)`).join(", "),
        suggestion: `Focus evidence templates on "${topReason.reason}" disputes since they account for the most volume.`,
      });
    }
  }

  // Revenue trends
  const revenueTrend = all(`
    SELECT date, SUM(total_revenue) as revenue, SUM(order_count) as orders
    FROM revenue_snapshots
    WHERE date >= date('now', '-14 days')
    GROUP BY date ORDER BY date ASC
  `);

  if (revenueTrend.length >= 7) {
    const recent7 = revenueTrend.slice(-7);
    const prev7 = revenueTrend.slice(0, 7);
    const recentTotal = recent7.reduce((s, r) => s + (r.revenue || 0), 0);
    const prevTotal = prev7.reduce((s, r) => s + (r.revenue || 0), 0);
    const change = prevTotal > 0 ? ((recentTotal - prevTotal) / prevTotal * 100) : 0;

    insights.push({
      type: "revenue",
      severity: change < -10 ? "warning" : change > 10 ? "success" : "info",
      title: `Revenue ${change >= 0 ? "Up" : "Down"} ${Math.abs(change).toFixed(1)}% WoW`,
      detail: `This week: $${recentTotal.toLocaleString()} vs last week: $${prevTotal.toLocaleString()}`,
      suggestion: change < -10
        ? "Revenue declining — check for checkout issues, expired subscriptions, or increased failed payments."
        : change > 10
          ? "Strong growth! Consider scaling marketing spend."
          : "Revenue is stable.",
    });
  }

  // Store health analysis
  const downStores = all(`
    SELECT s.name, MAX(uc.checked_at) as last_check, uc.status_code
    FROM uptime_checks uc
    JOIN stores s ON uc.store_id = s.id
    WHERE uc.checked_at = (SELECT MAX(checked_at) FROM uptime_checks WHERE store_id = uc.store_id)
    AND uc.status_code >= 400
    GROUP BY s.id
  `);

  if (downStores.length > 0) {
    insights.push({
      type: "uptime",
      severity: "error",
      title: `${downStores.length} Store${downStores.length > 1 ? "s" : ""} Currently Down`,
      detail: downStores.map(s => s.name).join(", "),
      suggestion: "Check server status and DNS configuration for affected stores immediately.",
    });
  }

  // Failed payments analysis
  const failedPayments = get(`
    SELECT SUM(orders_failed) as total_failed, SUM(order_count) as total_orders
    FROM revenue_snapshots
    WHERE date >= date('now', '-7 days')
  `);

  if (failedPayments && failedPayments.total_orders > 0) {
    const failRate = (failedPayments.total_failed / failedPayments.total_orders * 100);
    if (failRate > 5) {
      insights.push({
        type: "revenue",
        severity: "warning",
        title: `High Failed Payment Rate: ${failRate.toFixed(1)}%`,
        detail: `${failedPayments.total_failed} failed out of ${failedPayments.total_orders} orders this week.`,
        suggestion: "Check Stripe gateway configuration and card decline reasons. Consider enabling smart retries.",
      });
    }
  }

  // Inventory alerts
  const outOfStock = get("SELECT COUNT(DISTINCT product_id) as c FROM product_snapshots WHERE stock_status = 'outofstock'");
  const lowStock = get("SELECT COUNT(DISTINCT product_id) as c FROM product_snapshots WHERE stock_status = 'instock' AND stock_quantity > 0 AND stock_quantity <= 5");

  if (outOfStock && outOfStock.c > 0) {
    insights.push({
      type: "inventory",
      severity: outOfStock.c > 10 ? "warning" : "info",
      title: `${outOfStock.c} Products Out of Stock`,
      detail: `${lowStock?.c || 0} additional products have low stock (5 or fewer).`,
      suggestion: "Review inventory levels and restock popular items to avoid lost sales.",
    });
  }

  // SSL expiry warnings
  const sslExpiring = all(`
    SELECT s.name, uc.ssl_days_remaining
    FROM uptime_checks uc
    JOIN stores s ON uc.store_id = s.id
    WHERE uc.checked_at = (SELECT MAX(checked_at) FROM uptime_checks WHERE store_id = uc.store_id)
    AND uc.ssl_days_remaining IS NOT NULL AND uc.ssl_days_remaining <= 14
    ORDER BY uc.ssl_days_remaining ASC
  `);

  if (sslExpiring.length > 0) {
    insights.push({
      type: "uptime",
      severity: "warning",
      title: `${sslExpiring.length} SSL Certificate${sslExpiring.length > 1 ? "s" : ""} Expiring Soon`,
      detail: sslExpiring.map(s => `${s.name}: ${s.ssl_days_remaining} days`).join(", "),
      suggestion: "Renew SSL certificates before they expire to avoid browser security warnings.",
    });
  }

  res.json({ insights, generated: new Date().toISOString() });
});

module.exports = router;
