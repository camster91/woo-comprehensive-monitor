const { run, get, all, insert } = require("../db");

function createTicket({ storeId, portalUserId, subject, message, priority }) {
  return insert(
    "INSERT INTO tickets (store_id, portal_user_id, subject, message, priority) VALUES (?, ?, ?, ?, ?)",
    [storeId, portalUserId || null, subject, message, priority || "normal"]
  );
}

function getTickets({ storeId, status, limit = 50, offset = 0 } = {}) {
  const where = [];
  const params = [];
  if (storeId) { where.push("t.store_id = ?"); params.push(storeId); }
  if (status) { where.push("t.status = ?"); params.push(status); }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const total = get(`SELECT COUNT(*) as c FROM tickets t ${whereClause}`, params)?.c || 0;
  const tickets = all(
    `SELECT t.*, s.name as store_name, pu.email as user_email, pu.name as user_name
     FROM tickets t
     LEFT JOIN stores s ON t.store_id = s.id
     LEFT JOIN portal_users pu ON t.portal_user_id = pu.id
     ${whereClause}
     ORDER BY t.created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  return { tickets, total };
}

function getTicket(id) {
  return get(
    `SELECT t.*, s.name as store_name, pu.email as user_email, pu.name as user_name
     FROM tickets t
     LEFT JOIN stores s ON t.store_id = s.id
     LEFT JOIN portal_users pu ON t.portal_user_id = pu.id
     WHERE t.id = ?`,
    [id]
  );
}

function replyToTicket(id, adminReply) {
  run(
    "UPDATE tickets SET admin_reply = ?, replied_at = datetime('now'), status = 'replied', updated_at = datetime('now') WHERE id = ?",
    [adminReply, id]
  );
}

function updateTicketStatus(id, status) {
  run("UPDATE tickets SET status = ?, updated_at = datetime('now') WHERE id = ?", [status, id]);
}

function getTicketStats() {
  const total = get("SELECT COUNT(*) as c FROM tickets")?.c || 0;
  const open = get("SELECT COUNT(*) as c FROM tickets WHERE status = 'open'")?.c || 0;
  const replied = get("SELECT COUNT(*) as c FROM tickets WHERE status = 'replied'")?.c || 0;
  const closed = get("SELECT COUNT(*) as c FROM tickets WHERE status = 'closed'")?.c || 0;
  return { total, open, replied, closed };
}

module.exports = { createTicket, getTickets, getTicket, replyToTicket, updateTicketStatus, getTicketStats };
