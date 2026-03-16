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

module.exports = {
  upsertDispute,
  getDisputes,
  getDispute,
  getDisputeByStripeId,
  getDisputeStats,
  deleteDispute,
};
