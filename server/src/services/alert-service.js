/**
 * Alert Service
 *
 * Crash fixes:
 * 1. Emails are now fire-and-forget (queueAlertEmail) — request handlers no longer
 *    await Mailgun API calls, eliminating handler pile-up under load.
 * 2. Per-store+type email cooldown (30 min) — separate from alert dedup.
 *    Prevents email storms on restart (dedup was in-memory, lost on crash/restart).
 * 3. Alert dedup interval increased from 1h to 2h to reduce write pressure.
 */

const { run, get, all, insert } = require("../db");
const axios = require("axios");

// ---------------------------------------------------------------------------
// Alert dedup — prevents the same error flooding the alerts table
// ---------------------------------------------------------------------------
const lastAlertTimes = {};
const DEDUP_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 hours

function shouldDeduplicate(key) {
  const now = Date.now();
  if (lastAlertTimes[key] && now - lastAlertTimes[key] < DEDUP_INTERVAL_MS) {
    return true;
  }
  lastAlertTimes[key] = now;
  return false;
}

// ---------------------------------------------------------------------------
// Email cooldown — per store+type, separate from alert dedup
// Survives alert dedup reset; prevents email floods after restarts
// ---------------------------------------------------------------------------
const emailCooldowns = new Map();
const EMAIL_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes per store+type

function shouldSuppressEmail(storeId, type) {
  const key = `${storeId ?? "global"}:${type ?? "general"}`;
  const last = emailCooldowns.get(key);
  if (last && Date.now() - last < EMAIL_COOLDOWN_MS) return true;
  emailCooldowns.set(key, Date.now());
  return false;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------
function createAlert({ subject, message, storeId = null, severity = "medium", type = null }) {
  return insert(
    `INSERT INTO alerts (store_id, subject, message, severity, type, timestamp)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`,
    [storeId, subject, message, severity, type]
  );
}

function getAlerts({ storeId, severity, type, olderThan, limit = 100, offset = 0 } = {}) {
  const conditions = [];
  const params = [];

  if (storeId) { conditions.push("store_id = ?"); params.push(storeId); }
  if (severity) { conditions.push("severity = ?"); params.push(severity); }
  if (type)     { conditions.push("type = ?");     params.push(type); }
  if (olderThan){ conditions.push("timestamp < ?"); params.push(olderThan); }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const alerts = all(
    `SELECT * FROM alerts ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const countRow = get(`SELECT COUNT(*) as total FROM alerts ${where}`, params);
  return { alerts, total: countRow ? countRow.total : 0 };
}

function clearAlerts({ storeId, severity, olderThan } = {}) {
  const conditions = [];
  const params = [];

  if (storeId)  { conditions.push("store_id = ?");  params.push(storeId); }
  if (severity) { conditions.push("severity = ?");  params.push(severity); }
  if (olderThan){ conditions.push("timestamp < ?"); params.push(olderThan); }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const before = get(`SELECT COUNT(*) as c FROM alerts ${where}`, params);
  run(`DELETE FROM alerts ${where}`, params);
  return before ? before.c : 0;
}

function deleteAlert(id) {
  const before = get("SELECT COUNT(*) as c FROM alerts WHERE id = ?", [id]);
  run("DELETE FROM alerts WHERE id = ?", [id]);
  return before ? before.c : 0;
}

function getAlertStats() {
  const total = get("SELECT COUNT(*) as c FROM alerts");
  const bySeverity = all("SELECT severity, COUNT(*) as c FROM alerts GROUP BY severity");
  return {
    total: total ? total.c : 0,
    bySeverity: Object.fromEntries(bySeverity.map((r) => [r.severity, r.c])),
  };
}

// ---------------------------------------------------------------------------
// Email sending — always fire-and-forget (never awaited)
// ---------------------------------------------------------------------------
async function sendAlertEmail(subject, message) {
  if (!process.env.MAILGUN_API_KEY || !process.env.MAILGUN_DOMAIN) {
    console.log(`[Alert] ${subject}`);
    return;
  }

  const mailFrom =
    process.env.MAIL_FROM || `WooMonitor <alerts@${process.env.MAILGUN_DOMAIN}>`;
  await axios.post(
    `https://api.mailgun.net/v3/${process.env.MAILGUN_DOMAIN}/messages`,
    new URLSearchParams({
      from: mailFrom,
      to: process.env.ALERT_EMAIL,
      subject: `🚨 ${subject}`,
      text: message,
    }),
    { auth: { username: "api", password: process.env.MAILGUN_API_KEY } }
  );
}

/**
 * Queue an alert email — fire-and-forget with per-store+type cooldown.
 * Callers should use this instead of awaiting sendAlertEmail directly.
 *
 * @param {string} subject
 * @param {string} message
 * @param {string|null} storeId  — used for email cooldown key
 * @param {string|null} type     — used for email cooldown key
 */
function queueAlertEmail(subject, message, storeId = null, type = null) {
  if (shouldSuppressEmail(storeId, type)) return;

  sendAlertEmail(subject, message).catch((err) => {
    console.error("[Alert Email Error]", err.message);
  });
}

module.exports = {
  createAlert,
  getAlerts,
  clearAlerts,
  deleteAlert,
  getAlertStats,
  shouldDeduplicate,
  // sendAlertEmail is kept for backward compat but callers should prefer queueAlertEmail
  sendAlertEmail,
  queueAlertEmail,
};
