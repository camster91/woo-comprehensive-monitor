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
  // CORS
  //
  // /api/track-woo-error — wide-open CORS: WordPress plugins call this from
  //   any domain (each client's WooCommerce store).
  //
  // All other endpoints — restricted to the configured FQDN + localhost dev.
  //   The React dashboard is served by the same Express server so its requests
  //   are same-origin and don't need CORS at all, but we still lock down
  //   cross-origin access to prevent CSRF from third-party sites.
  // -------------------------------------------------------------------------
  app.use("/api/track-woo-error", cors()); // wildcard for plugin callbacks

  const allowedOrigins = [
    process.env.APP_FQDN || "https://woo.ashbi.ca",
    "http://localhost:3000",
    "http://localhost:5173",
  ].concat(
    (process.env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean)
  );

  app.use(cors({
    origin(origin, cb) {
      // Allow same-origin requests (no Origin header) — curl, server-to-server, etc.
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      cb(Object.assign(new Error(`CORS: ${origin} not allowed`), { status: 403 }));
    },
    credentials: true,
  }));

  // -------------------------------------------------------------------------
  // Core middleware
  // -------------------------------------------------------------------------
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
  // Auth — scoped to /api only so the React SPA (and login page) can load
  // for unauthenticated users.  Non-/api paths (HTML, JS, CSS assets) are
  // always served without auth checks; the SPA handles the login flow.
  // -------------------------------------------------------------------------
  app.use("/api", apiKeyMiddleware);
  app.use("/api", authMiddleware);

  // -------------------------------------------------------------------------
  // API routes
  // -------------------------------------------------------------------------
  app.use("/api", require("./routes/tracking"));
  app.use("/api", require("./routes/stores"));
  app.use("/api", require("./routes/alerts"));
  app.use("/api", require("./routes/dashboard"));
  app.use("/api", require("./routes/auth"));
  app.use("/api", require("./routes/chat"));
  app.use("/api", require("./routes/disputes"));
  app.use("/api", require("./routes/system"));
  app.use("/api", require("./routes/revenue"));

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
