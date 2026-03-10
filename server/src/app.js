const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const path = require("path");

function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(cookieParser());

  // API routes will be mounted here as we build them

  // Serve React dashboard in production
  const dashboardPath = path.join(__dirname, "../dashboard/dist");
  app.use(express.static(dashboardPath));
  // SPA fallback — serve index.html for non-API routes
  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(dashboardPath, "index.html"), (err) => {
      if (err) res.status(404).send("Dashboard not built. Run: npm run dashboard:build");
    });
  });

  return app;
}

module.exports = { createApp };
