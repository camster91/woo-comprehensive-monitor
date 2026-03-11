const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const path = require("path");
const { apiKeyMiddleware, authMiddleware } = require("./middleware/auth");

function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(cookieParser());
  app.use(apiKeyMiddleware);
  app.use(authMiddleware);

  // API routes
  app.use("/api", require("./routes/tracking"));
  app.use("/api", require("./routes/stores"));
  app.use("/api", require("./routes/alerts"));
  app.use("/api", require("./routes/dashboard"));
  app.use("/api", require("./routes/auth"));
  app.use("/api", require("./routes/chat"));
  app.use("/api", require("./routes/system"));

  // Serve React dashboard in production
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
