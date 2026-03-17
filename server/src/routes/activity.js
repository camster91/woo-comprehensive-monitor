const { Router } = require("express");
const activityService = require("../services/activity-service");

const router = Router();

router.get("/activity", (req, res) => {
  const { storeId, eventType, limit, offset } = req.query;
  const result = activityService.getActivity({
    storeId: storeId || undefined,
    eventType: eventType || undefined,
    limit: parseInt(limit) || 30,
    offset: parseInt(offset) || 0,
  });
  res.json(result);
});

module.exports = router;
