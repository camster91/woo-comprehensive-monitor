const { Router } = require("express");
const notificationService = require("../services/notification-service");

const router = Router();

// Admin notifications
router.get("/notifications", (req, res) => {
  const { unreadOnly, limit, offset } = req.query;
  const result = notificationService.getNotifications({
    userType: "admin",
    userId: null,
    unreadOnly: unreadOnly === "true",
    limit: parseInt(limit) || 50,
    offset: parseInt(offset) || 0,
  });
  res.json(result);
});

router.get("/notifications/count", (req, res) => {
  const count = notificationService.getUnreadCount({ userType: "admin" });
  res.json({ unread: count });
});

router.post("/notifications/:id/read", (req, res) => {
  notificationService.markRead(parseInt(req.params.id));
  res.json({ status: "ok" });
});

router.post("/notifications/read-all", (req, res) => {
  notificationService.markAllRead({ userType: "admin" });
  res.json({ status: "ok" });
});

module.exports = router;
