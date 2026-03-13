const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const path = require("path");
const rateLimit = require("express-rate-limit");
const { apiKeyMiddleware, authMiddleware } = require("./middleware/auth");

function createApp() {
  const app = express();

  // Trust Coolify/Nginx reverse-proxy so req.ip returns real client IP
  app.set("trust proxy", 1);

  // -------------------------------------------------------------------------
  // Core middleware
  // -------------------------------------------------------------------------
  app.use(cors());
  // Limit request body to 200 KB — protects against accidental or malicious large payloads
  app.use(express.json({ limit: "200kb" }));
  app.use(cookieParser());

  // -------------------------------------------------------------------------
  // Rate limiting
  // -------------------------------------------------------------------------

  // Tracking endpoint: 300 req/min per IP (5/sec burst headroom).
  // 25 busy stores legitimately send maybe 1-5 events/min each = ~125/min max.
  // This blocks runaway/buggy plugins while allowing all normal traffic.
  const trackingLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: "Rate limit exceeded. Please wait before retrying." },
  });

  // Auth endpoints: strict limit to prevent brute-force on verification codes
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many auth attempts. Please wait 15 minutes." },
  });

  // General API: 600 req/min (dashboard polling, store management, etc.)
  const generalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 600,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests." },
  });

  // Apply rate limiters before auth middleware
  app.use("/api/track-woo-error", trackingLimiter);
  app.use("/api/auth", authLimiter);
  app.use("/api", generalLimiter);

  // -------------------------------------------------------------------------
  // Auth
  // -------------------------------------------------------------------------
  app.use(apiKeyMiddleware);
  app.use(authMiddleware);

  // -------------------------------------------------------------------------
  // API routes
  // -------------------------------------------------------------------------
  app.use("/api", require("./routes/tracking"));
  app.use("/api", require("./routes/stores"));
  app.use("/api", require("./routes/alerts"));
  app.use("/api", require("./routes/dashboard"));
  app.use("/api", require("./routes/auth"));
  app.use("/api", require("./routes/chat"));
  app.use("/api", require("./routes/system"));

  // -------------------------------------------------------------------------
  // Serve React dashboard (production build)
  // -------------------------------------------------------------------------
  const dashboardPath = path.join(__dirname, "../dashboard/dist");
  app.use(express.static(dashboardPath));

  // SPA fallback — serve index.html for non-API routes (Express 5 compatible)
  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(dashboardPath, "index.html"), (err) => {
      if (err) res.status(404).send("Dashboard not built. Run: npm run dashboard:build");
    });
  });

  return app;
}

module.exports = { createApp };
