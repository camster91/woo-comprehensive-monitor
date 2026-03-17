const { getPortalUser } = require("../services/portal-service");

function portalAuthMiddleware(req, res, next) {
  const token = req.headers["x-portal-token"] || req.query.portal_token;
  if (!token) return res.status(401).json({ error: "Portal authentication required" });

  const user = getPortalUser(token);
  if (!user) return res.status(401).json({ error: "Invalid or expired portal token" });

  req.portalUser = user;
  next();
}

module.exports = { portalAuthMiddleware };
