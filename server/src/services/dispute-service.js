const { run, get, all, insert } = require("../db");

function upsertDispute({
  stripeDisputeId, stripeChargeId, orderId,
  customerName, customerEmail, amount, currency,
  reason, status, dueBy, evidenceGenerated, evidenceSummary,
  storeId, storeName, storeUrl, products, metadata,
}) {
  const existing = get("SELECT id FROM disputes WHERE stripe_dispute_id = ?", [stripeDisputeId]);

  if (existing) {
    const fields = [];
    const params = [];
    if (status !== undefined)            { fields.push("status = ?");             params.push(status); }
    if (reason !== undefined)            { fields.push("reason = ?");             params.push(reason); }
    if (dueBy !== undefined)             { fields.push("due_by = ?");             params.push(dueBy); }
    if (evidenceGenerated !== undefined) { fields.push("evidence_generated = ?"); params.push(evidenceGenerated ? 1 : 0); }
    if (evidenceSummary !== undefined)   { fields.push("evidence_summary = ?");   params.push(evidenceSummary); }
    if (metadata !== undefined)          { fields.push("metadata = ?");           params.push(JSON.stringify(metadata)); }
    fields.push("updated_at = datetime('now')");
    if (fields.length > 1) {
      run(`UPDATE disputes SET ${fields.join(", ")} WHERE stripe_dispute_id = ?`, [...params, stripeDisputeId]);
    }
    return { action: "updated", id: existing.id };
  }

  const id = insert(
    `INSERT INTO disputes (stripe_dispute_id, stripe_charge_id, order_id,
      customer_name, customer_email, amount, currency, reason, status,
      due_by, evidence_generated, evidence_summary, store_id, store_name,
      store_url, products, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      stripeDisputeId, stripeChargeId || null, orderId || null,
      customerName || null, customerEmail || null, amount || null, currency || "USD",
      reason || null, status || "needs_response",
      dueBy || null, evidenceGenerated ? 1 : 0, evidenceSummary || null,
      storeId || null, storeName || null, storeUrl || null,
      JSON.stringify(products || []), JSON.stringify(metadata || {}),
    ]
  );
  return { action: "created", id };
}

function getDisputes({ storeId, status, limit = 50, offset = 0 } = {}) {
  const where = [];
  const params = [];
  if (storeId) { where.push("store_id = ?"); params.push(storeId); }
  if (status)  { where.push("status = ?");   params.push(status); }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const total = get(`SELECT COUNT(*) as c FROM disputes ${whereClause}`, params)?.c || 0;
  const disputes = all(
    `SELECT * FROM disputes ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const parsed = disputes.map(d => ({
    ...d,
    products: JSON.parse(d.products || "[]"),
    metadata: JSON.parse(d.metadata || "{}"),
    evidence_generated: !!d.evidence_generated,
  }));

  return { disputes: parsed, total };
}

function getDispute(id) {
  const d = get("SELECT * FROM disputes WHERE id = ?", [id]);
  if (!d) return null;
  return {
    ...d,
    products: JSON.parse(d.products || "[]"),
    metadata: JSON.parse(d.metadata || "{}"),
    evidence_generated: !!d.evidence_generated,
  };
}

function getDisputeByStripeId(stripeDisputeId) {
  const d = get("SELECT * FROM disputes WHERE stripe_dispute_id = ?", [stripeDisputeId]);
  if (!d) return null;
  return {
    ...d,
    products: JSON.parse(d.products || "[]"),
    metadata: JSON.parse(d.metadata || "{}"),
    evidence_generated: !!d.evidence_generated,
  };
}

function getDisputeStats() {
  const total = get("SELECT COUNT(*) as c FROM disputes")?.c || 0;
  const needsResponse = get("SELECT COUNT(*) as c FROM disputes WHERE status IN ('needs_response','warning_needs_response')")?.c || 0;
  const won = get("SELECT COUNT(*) as c FROM disputes WHERE status = 'won'")?.c || 0;
  const lost = get("SELECT COUNT(*) as c FROM disputes WHERE status = 'lost'")?.c || 0;
  const totalAmount = get("SELECT COALESCE(SUM(amount), 0) as s FROM disputes")?.s || 0;
  const lostAmount = get("SELECT COALESCE(SUM(amount), 0) as s FROM disputes WHERE status = 'lost'")?.s || 0;
  return { total, needsResponse, won, lost, totalAmount, lostAmount };
}

function deleteDispute(id) {
  run("DELETE FROM disputes WHERE id = ?", [id]);
}

function getDueForAutoSubmit() {
  return all(
    `SELECT d.*, s.consumer_key, s.consumer_secret, s.url as store_api_url
     FROM disputes d
     LEFT JOIN stores s ON d.store_id = s.id
     WHERE d.auto_submit_at <= datetime('now')
       AND d.hold = 0
       AND d.status IN ('needs_response', 'warning_needs_response')
       AND d.auto_submit_at IS NOT NULL`,
    []
  ).map(d => ({
    ...d,
    products: JSON.parse(d.products || "[]"),
    metadata: JSON.parse(d.metadata || "{}"),
    evidence_generated: !!d.evidence_generated,
  }));
}

function setHold(id, hold) {
  if (hold) {
    run("UPDATE disputes SET hold = 1, auto_submit_at = NULL, updated_at = datetime('now') WHERE id = ?", [id]);
  } else {
    run("UPDATE disputes SET hold = 0, auto_submit_at = datetime('now', '+24 hours'), updated_at = datetime('now') WHERE id = ?", [id]);
  }
}

function setAutoSubmitAt(stripeDisputeId, timestamp) {
  run("UPDATE disputes SET auto_submit_at = ?, updated_at = datetime('now') WHERE stripe_dispute_id = ?", [timestamp, stripeDisputeId]);
}

function clearAutoSubmit(id) {
  run("UPDATE disputes SET auto_submit_at = NULL, hold = 0, updated_at = datetime('now') WHERE id = ?", [id]);
}

function getDisputeAnalytics(period) {
  const startDate = periodToStartDate(period);
  const dateFilter = startDate ? "WHERE created_at >= ?" : "";
  const params = startDate ? [startDate] : [];

  const summary = get(
    `SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) as won,
      SUM(CASE WHEN status = 'lost' THEN 1 ELSE 0 END) as lost,
      SUM(CASE WHEN status IN ('needs_response', 'warning_needs_response') THEN 1 ELSE 0 END) as pending,
      COALESCE(SUM(amount), 0) as totalAmount,
      COALESCE(SUM(CASE WHEN status = 'lost' THEN amount ELSE 0 END), 0) as lostAmount
     FROM disputes ${dateFilter}`,
    params
  );
  const winLossTotal = (summary.won || 0) + (summary.lost || 0);
  summary.winRate = winLossTotal > 0 ? parseFloat(((summary.won / winLossTotal) * 100).toFixed(1)) : null;

  const byStore = all(
    `SELECT
      store_name,
      COUNT(*) as total,
      SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) as won,
      SUM(CASE WHEN status = 'lost' THEN 1 ELSE 0 END) as lost,
      SUM(CASE WHEN status IN ('needs_response', 'warning_needs_response') THEN 1 ELSE 0 END) as needs_response,
      COALESCE(SUM(amount), 0) as total_amount,
      COALESCE(SUM(CASE WHEN status = 'lost' THEN amount ELSE 0 END), 0) as lost_amount
     FROM disputes ${dateFilter}
     GROUP BY store_name
     ORDER BY total DESC`,
    params
  ).map(r => ({
    ...r,
    win_rate: (r.won + r.lost) > 0 ? parseFloat(((r.won / (r.won + r.lost)) * 100).toFixed(1)) : null,
  }));

  const byReason = all(
    `SELECT
      reason,
      COUNT(*) as total,
      SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) as won,
      SUM(CASE WHEN status = 'lost' THEN 1 ELSE 0 END) as lost
     FROM disputes ${dateFilter}
     GROUP BY reason
     ORDER BY total DESC`,
    params
  ).map(r => ({
    ...r,
    win_rate: (r.won + r.lost) > 0 ? parseFloat(((r.won / (r.won + r.lost)) * 100).toFixed(1)) : null,
  }));

  const days = periodToDays(period);
  const groupExpr = days > 60 ? "strftime('%Y-W%W', created_at)" : "date(created_at)";
  const overTime = all(
    `SELECT
      ${groupExpr} as date,
      COUNT(*) as opened,
      SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) as won,
      SUM(CASE WHEN status = 'lost' THEN 1 ELSE 0 END) as lost
     FROM disputes ${dateFilter}
     GROUP BY ${groupExpr}
     ORDER BY date ASC`,
    params
  );

  return { summary, byStore, byReason, overTime };
}

function getUpcomingDeadlines() {
  return all(
    `SELECT *, CAST(julianday(due_by) - julianday('now') AS INTEGER) as days_remaining
     FROM disputes
     WHERE status IN ('needs_response', 'warning_needs_response')
       AND due_by IS NOT NULL
     ORDER BY due_by ASC`,
    []
  ).map(d => {
    const dr = d.days_remaining;
    let urgency;
    if (dr < 0) urgency = "overdue";
    else if (dr === 0) urgency = "today";
    else if (dr <= 3) urgency = "urgent";
    else if (dr <= 7) urgency = "soon";
    else urgency = "normal";
    return {
      ...d,
      products: JSON.parse(d.products || "[]"),
      metadata: JSON.parse(d.metadata || "{}"),
      evidence_generated: !!d.evidence_generated,
      urgency,
    };
  });
}

function periodToStartDate(period) {
  const days = periodToDays(period);
  if (!days) return null;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}

function periodToDays(period) {
  switch (period) {
    case "30d": return 30;
    case "90d": return 90;
    case "all": return null;
    default: return 30;
  }
}

module.exports = {
  upsertDispute,
  getDisputes,
  getDispute,
  getDisputeByStripeId,
  getDisputeStats,
  deleteDispute,
  getDueForAutoSubmit,
  setHold,
  setAutoSubmitAt,
  clearAutoSubmit,
  getDisputeAnalytics,
  getUpcomingDeadlines,
};
