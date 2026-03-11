const { run, get, all, insert } = require("../db");
const axios = require("axios");

// Deduplication: track last alert time per error key
const lastAlertTimes = {};
const DEDUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

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
  if (type) { conditions.push("type = ?"); params.push(type); }
  if (olderThan) { conditions.push("timestamp < ?"); params.push(olderThan); }

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

  if (storeId) { conditions.push("store_id = ?"); params.push(storeId); }
  if (severity) { conditions.push("severity = ?"); params.push(severity); }
  if (olderThan) { conditions.push("timestamp < ?"); params.push(olderThan); }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  // Count before delete
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
    bySeverity: Object.fromEntries(bySeverity.map(r => [r.severity, r.c])),
  };
}

function shouldDeduplicate(key) {
  const now = Date.now();
  if (lastAlertTimes[key] && now - lastAlertTimes[key] < DEDUP_INTERVAL_MS) {
    return true;
  }
  lastAlertTimes[key] = now;
  return false;
}

async function sendAlertEmail(subject, message) {
  if (!process.env.MAILGUN_API_KEY || !process.env.MAILGUN_DOMAIN) {
    console.log(`[Alert] ${subject}`);
    return;
  }

  try {
    const mailFrom = process.env.MAIL_FROM || `WooMonitor <alerts@${process.env.MAILGUN_DOMAIN}>`;
    await axios.post(
      `https://api.mailgun.net/v3/${process.env.MAILGUN_DOMAIN}/messages`,
      new URLSearchParams({ from: mailFrom, to: process.env.ALERT_EMAIL, subject: `🚨 ${subject}`, text: message }),
      { auth: { username: "api", password: process.env.MAILGUN_API_KEY } }
    );
  } catch (err) {
    console.error("[Alert Email Error]", err.message);
  }
}

module.exports = {
  createAlert,
  getAlerts,
  clearAlerts,
  deleteAlert,
  getAlertStats,
  shouldDeduplicate,
  sendAlertEmail,
};
