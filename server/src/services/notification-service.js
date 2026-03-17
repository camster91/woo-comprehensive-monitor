const { run, get, all, insert } = require("../db");

function createNotification({ userType = "admin", userId = null, title, message, type = "info", link = null }) {
  return insert(
    `INSERT INTO notifications (user_type, user_id, title, message, type, link)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userType, userId, title, message || null, type, link]
  );
}

function getNotifications({ userType = "admin", userId = null, unreadOnly = false, limit = 50, offset = 0 } = {}) {
  const where = ["user_type = ?"];
  const params = [userType];

  if (userId !== null) {
    where.push("user_id = ?");
    params.push(userId);
  } else {
    where.push("user_id IS NULL");
  }

  if (unreadOnly) {
    where.push("read = 0");
  }

  const whereClause = `WHERE ${where.join(" AND ")}`;
  const total = get(`SELECT COUNT(*) as c FROM notifications ${whereClause}`, params)?.c || 0;
  const unread = get(`SELECT COUNT(*) as c FROM notifications ${whereClause.replace("read = 0", "1=1")} AND read = 0`, params)?.c || 0;
  const items = all(
    `SELECT * FROM notifications ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return { notifications: items, total, unread };
}

function getUnreadCount({ userType = "admin", userId = null } = {}) {
  const where = ["user_type = ?", "read = 0"];
  const params = [userType];

  if (userId !== null) {
    where.push("user_id = ?");
    params.push(userId);
  } else {
    where.push("user_id IS NULL");
  }

  return get(`SELECT COUNT(*) as c FROM notifications WHERE ${where.join(" AND ")}`, params)?.c || 0;
}

function markRead(id) {
  run("UPDATE notifications SET read = 1 WHERE id = ?", [id]);
}

function markAllRead({ userType = "admin", userId = null } = {}) {
  if (userId !== null) {
    run("UPDATE notifications SET read = 1 WHERE user_type = ? AND user_id = ? AND read = 0", [userType, userId]);
  } else {
    run("UPDATE notifications SET read = 1 WHERE user_type = ? AND user_id IS NULL AND read = 0", [userType]);
  }
}

function deleteOldNotifications(days = 30) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  run("DELETE FROM notifications WHERE created_at < ?", [cutoff]);
}

// Helper: notify admin about key events
function notifyAdmin(title, message, type = "info", link = null) {
  createNotification({ userType: "admin", userId: null, title, message, type, link });
}

// Helper: notify a portal client
function notifyClient(userId, title, message, type = "info", link = null) {
  createNotification({ userType: "client", userId, title, message, type, link });
}

module.exports = {
  createNotification,
  getNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
  deleteOldNotifications,
  notifyAdmin,
  notifyClient,
};
