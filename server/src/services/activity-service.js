const { run, get, all, insert } = require("../db");

function logActivity({ storeId = null, eventType, title, detail = null, severity = "info", metadata = null }) {
  return insert(
    `INSERT INTO activity_log (store_id, event_type, title, detail, severity, metadata)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [storeId, eventType, title, detail, severity, metadata ? JSON.stringify(metadata) : null]
  );
}

function getActivity({ storeId, eventType, limit = 50, offset = 0 } = {}) {
  const where = [];
  const params = [];

  if (storeId) { where.push("a.store_id = ?"); params.push(storeId); }
  if (eventType) { where.push("a.event_type = ?"); params.push(eventType); }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const items = all(
    `SELECT a.*, s.name as store_name
     FROM activity_log a
     LEFT JOIN stores s ON a.store_id = s.id
     ${whereClause}
     ORDER BY a.created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const total = get(`SELECT COUNT(*) as c FROM activity_log a ${whereClause}`, params)?.c || 0;

  return {
    activities: items.map(a => ({
      ...a,
      metadata: a.metadata ? JSON.parse(a.metadata) : null,
    })),
    total,
  };
}

function pruneActivity(days = 30) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  run("DELETE FROM activity_log WHERE created_at < ?", [cutoff]);
}

module.exports = { logActivity, getActivity, pruneActivity };
