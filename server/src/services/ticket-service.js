const { run, get, all, insert } = require("../db");
const { sendEmail } = require("./email-service");
const notificationService = require("./notification-service");
const activityService = require("./activity-service");

function createTicket({ storeId, portalUserId, subject, message, priority }) {
  const id = insert(
    "INSERT INTO tickets (store_id, portal_user_id, subject, message, priority) VALUES (?, ?, ?, ?, ?)",
    [storeId, portalUserId || null, subject, message, priority || "normal"]
  );

  // V2: Notify admin + log activity
  try {
    notificationService.notifyAdmin(`New ticket: ${subject}`, message, "info", "/tickets");
    activityService.logActivity({ storeId, eventType: "ticket", title: `New ticket: ${subject}`, detail: message, severity: "info" });

    // Email admin
    const adminEmail = process.env.ALERT_EMAIL;
    if (adminEmail) {
      sendEmail({ to: adminEmail, subject: `New Ticket: ${subject}`, text: `A new support ticket was submitted:\n\n${message}\n\nPriority: ${priority || "normal"}` }).catch(() => {});
    }
  } catch (_) {}

  return id;
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

  // V2: Email client when admin replies
  try {
    const ticket = get(
      `SELECT t.*, pu.email as user_email, pu.name as user_name, pu.id as portal_user_id, s.name as store_name
       FROM tickets t
       LEFT JOIN portal_users pu ON t.portal_user_id = pu.id
       LEFT JOIN stores s ON t.store_id = s.id
       WHERE t.id = ?`,
      [id]
    );
    if (ticket && ticket.user_email) {
      sendEmail({
        to: ticket.user_email,
        subject: `Re: ${ticket.subject}`,
        text: `Hi ${ticket.user_name || ""},\n\nWe've replied to your ticket:\n\n${adminReply}\n\n— Influencers Link Support`,
      }).catch(() => {});

      // Notify client in-app
      notificationService.notifyClient(ticket.portal_user_id, `Reply to: ${ticket.subject}`, adminReply, "success", "/tickets");
    }

    activityService.logActivity({
      storeId: ticket?.store_id, eventType: "ticket",
      title: `Ticket replied: ${ticket?.subject || id}`, severity: "success",
    });
  } catch (_) {}
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
