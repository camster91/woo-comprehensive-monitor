require("dotenv").config();
const { initDB } = require("./db");
const { createApp } = require("./app");
const cron = require("node-cron");
const { checkAllStores } = require("./services/health-checker");
const { cleanupExpired } = require("./services/auth-service");

const PORT = process.env.PORT || 3000;

async function start() {
  await initDB();
  const app = createApp();

  // Health checks every 15 minutes
  cron.schedule("*/15 * * * *", () => checkAllStores());

  // Cleanup expired tokens daily at 3am
  cron.schedule("0 3 * * *", () => cleanupExpired());

  app.listen(PORT, () => {
    console.log(`Woo Monitor v3.0.0 listening on port ${PORT}`);
    console.log(`Dashboard: http://localhost:${PORT}/dashboard`);
    // Run initial health check after 5s
    setTimeout(() => checkAllStores(), 5000);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
