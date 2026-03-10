require("dotenv").config();
const { initDB } = require("./db");
const { createApp } = require("./app");

const PORT = process.env.PORT || 3000;

async function start() {
  await initDB();
  const app = createApp();

  app.listen(PORT, () => {
    console.log(`Woo Monitor v3.0.0 listening on port ${PORT}`);
    console.log(`Dashboard: http://localhost:${PORT}/dashboard`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
