# Woo Comprehensive Monitor — Full Rebuild

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebuild the monitoring server and dashboard from a fragile monolith (2400-line server.js + 2500-line inline HTML) into a modular Express backend with SQLite persistence and a React + Vite frontend.

**Architecture:** Express API server split into route modules and service layers. SQLite via better-sqlite3 for persistent storage (stores, alerts, stats, auth). React + Vite SPA served as static files from Express in production, with Vite dev proxy in development. Single Docker container.

**Tech Stack:** Node.js 18, Express 5, better-sqlite3, React 18, Vite, Chart.js (react-chartjs-2), Tailwind CSS, Docker.

**Plugin Compatibility:** The WordPress plugin sends data to `POST /api/track-woo-error`. This endpoint contract is frozen — all event types and field names must be preserved exactly.

---

## Task 1: Project Scaffolding

**Files:**
- Create: `server/src/index.js`
- Create: `server/src/app.js`
- Create: `server/dashboard/package.json`
- Create: `server/dashboard/vite.config.js`
- Create: `server/dashboard/index.html`
- Create: `server/dashboard/src/main.jsx`
- Create: `server/dashboard/src/App.jsx`
- Create: `server/dashboard/tailwind.config.js`
- Create: `server/dashboard/postcss.config.js`
- Modify: `server/package.json`

**Step 1: Update server package.json**

Add new dependencies, add build scripts. Keep all existing deps for now (remove later as modules are migrated).

```json
{
  "name": "woo-monitor",
  "version": "3.0.0",
  "description": "WooCommerce Monitoring Server",
  "main": "src/index.js",
  "type": "commonjs",
  "scripts": {
    "start": "node src/index.js",
    "dev": "node --watch src/index.js",
    "dashboard:dev": "cd dashboard && npm run dev",
    "dashboard:build": "cd dashboard && npm run build",
    "build": "npm run dashboard:build"
  },
  "dependencies": {
    "@woocommerce/woocommerce-rest-api": "^1.0.2",
    "axios": "^1.13.5",
    "better-sqlite3": "^11.0.0",
    "cookie-parser": "^1.4.7",
    "cors": "^2.8.6",
    "dotenv": "^17.3.1",
    "express": "^5.2.1",
    "node-cron": "^4.2.1"
  }
}
```

Run: `cd server && npm install better-sqlite3`

**Step 2: Create Express app skeleton**

Create `server/src/app.js`:

```javascript
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const path = require("path");

function createApp(db) {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(cookieParser());

  // API routes will be mounted here as we build them
  // app.use("/api", require("./routes/..."));

  // Serve React dashboard in production
  const dashboardPath = path.join(__dirname, "../dashboard/dist");
  app.use(express.static(dashboardPath));
  app.get("/dashboard", (req, res) => {
    res.sendFile(path.join(dashboardPath, "index.html"));
  });
  app.get("/", (req, res) => res.redirect("/dashboard"));

  return app;
}

module.exports = { createApp };
```

Create `server/src/index.js`:

```javascript
require("dotenv").config();
const { createApp } = require("./app");
const { initDB } = require("./db");

const PORT = process.env.PORT || 3000;
const db = initDB();
const app = createApp(db);

app.listen(PORT, () => {
  console.log(`Woo Monitor v3.0.0 listening on port ${PORT}`);
});
```

**Step 3: Scaffold React + Vite dashboard**

Run:
```bash
cd server && npm create vite@latest dashboard -- --template react
cd server/dashboard && npm install
npm install tailwindcss @tailwindcss/vite react-router-dom react-chartjs-2 chart.js
```

Create `server/dashboard/vite.config.js`:

```javascript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
  build: {
    outDir: "dist",
  },
});
```

Replace `server/dashboard/src/index.css` with:

```css
@import "tailwindcss";
```

Create `server/dashboard/src/App.jsx`:

```jsx
export default function App() {
  return <div className="min-h-screen bg-gray-100 p-4">
    <h1 className="text-2xl font-bold">Woo Monitor</h1>
    <p className="text-gray-600">Dashboard loading...</p>
  </div>;
}
```

**Step 4: Verify both servers start**

Terminal 1: `cd server && node src/index.js` — expect "listening on port 3000"
Terminal 2: `cd server/dashboard && npm run dev` — expect Vite on 5173

Visit http://localhost:5173 — expect "Woo Monitor" heading with Tailwind styling.

**Step 5: Commit**

```bash
git add server/src server/dashboard server/package.json
git commit -m "feat: scaffold Express + React + Vite project structure"
```

---

## Task 2: SQLite Database Layer

**Files:**
- Create: `server/src/db.js`
- Create: `server/migrations/001_initial.sql`

**Step 1: Write the migration SQL**

Create `server/migrations/001_initial.sql`:

```sql
CREATE TABLE IF NOT EXISTS stores (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  consumer_key TEXT,
  consumer_secret TEXT,
  plugin_version TEXT,
  woocommerce_version TEXT,
  wordpress_version TEXT,
  php_version TEXT,
  settings TEXT DEFAULT '{}',
  sync_config TEXT DEFAULT '{}',
  last_seen TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id TEXT,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  type TEXT,
  timestamp TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_alerts_store ON alerts(store_id);
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity);
CREATE INDEX IF NOT EXISTS idx_alerts_timestamp ON alerts(timestamp DESC);

CREATE TABLE IF NOT EXISTS store_stats (
  store_id TEXT PRIMARY KEY,
  features TEXT DEFAULT '{}',
  health_status TEXT DEFAULT 'unknown',
  admin_notices TEXT DEFAULT '[]',
  error_counts TEXT DEFAULT '{}',
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS auth_tokens (
  token TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  issued TEXT DEFAULT (datetime('now')),
  expires TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_codes (
  email TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  expires TEXT NOT NULL
);
```

**Step 2: Write the db module**

Create `server/src/db.js`:

```javascript
const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");

let _db;

function initDB(dbPath) {
  const resolvedPath = dbPath || process.env.DB_PATH || path.join(__dirname, "../data/woo-monitor.db");

  // Ensure directory exists
  const dir = path.dirname(resolvedPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  _db = new Database(resolvedPath);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  // Run migrations
  const migration = fs.readFileSync(
    path.join(__dirname, "../migrations/001_initial.sql"),
    "utf8"
  );
  _db.exec(migration);

  console.log(`Database initialized at ${resolvedPath}`);
  return _db;
}

function getDB() {
  if (!_db) throw new Error("Database not initialized. Call initDB() first.");
  return _db;
}

module.exports = { initDB, getDB };
```

**Step 3: Verify database initializes**

Run: `cd server && node -e "const {initDB} = require('./src/db'); const db = initDB(); console.log(db.prepare('SELECT name FROM sqlite_master WHERE type=\\'table\\'').all());"`

Expected: Array with tables `stores`, `alerts`, `store_stats`, `auth_tokens`, `auth_codes`.

**Step 4: Commit**

```bash
git add server/src/db.js server/migrations/
git commit -m "feat: add SQLite database layer with initial schema"
```

---

## Task 3: Alert Service

**Files:**
- Create: `server/src/services/alert-service.js`

**Step 1: Write the alert service**

This replaces the in-memory `alertHistory` array and `sendAlert` function.

```javascript
const { getDB } = require("../db");
const axios = require("axios");

// Deduplication: track last alert time per error key
const lastAlertTimes = {};
const DEDUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

function createAlert({ subject, message, storeId = null, severity = "medium", type = null }) {
  const db = getDB();
  const stmt = db.prepare(
    `INSERT INTO alerts (store_id, subject, message, severity, type, timestamp)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`
  );
  const result = stmt.run(storeId, subject, message, severity, type);
  return result.lastInsertRowid;
}

function getAlerts({ storeId, severity, type, olderThan, limit = 100, offset = 0 } = {}) {
  const db = getDB();
  const conditions = [];
  const params = [];

  if (storeId) { conditions.push("store_id = ?"); params.push(storeId); }
  if (severity) { conditions.push("severity = ?"); params.push(severity); }
  if (type) { conditions.push("type = ?"); params.push(type); }
  if (olderThan) { conditions.push("timestamp < ?"); params.push(olderThan); }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = db.prepare(
    `SELECT * FROM alerts ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`
  ).all(...params, limit, offset);

  const countRow = db.prepare(`SELECT COUNT(*) as total FROM alerts ${where}`).get(...params);
  return { alerts: rows, total: countRow.total };
}

function clearAlerts({ storeId, severity, olderThan } = {}) {
  const db = getDB();
  const conditions = [];
  const params = [];

  if (storeId) { conditions.push("store_id = ?"); params.push(storeId); }
  if (severity) { conditions.push("severity = ?"); params.push(severity); }
  if (olderThan) { conditions.push("timestamp < ?"); params.push(olderThan); }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = db.prepare(`DELETE FROM alerts ${where}`).run(...params);
  return result.changes;
}

function deleteAlert(id) {
  const db = getDB();
  return db.prepare("DELETE FROM alerts WHERE id = ?").run(id).changes;
}

function getAlertStats() {
  const db = getDB();
  const total = db.prepare("SELECT COUNT(*) as c FROM alerts").get().c;
  const bySeverity = db.prepare(
    "SELECT severity, COUNT(*) as c FROM alerts GROUP BY severity"
  ).all();
  return { total, bySeverity: Object.fromEntries(bySeverity.map(r => [r.severity, r.c])) };
}

function shouldDeduplicate(key) {
  const now = Date.now();
  if (lastAlertTimes[key] && now - lastAlertTimes[key] < DEDUP_INTERVAL_MS) {
    return true;
  }
  lastAlertTimes[key] = now;
  return false;
}

async function sendAlertEmail(subject, message) {
  if (!process.env.MAILGUN_API_KEY || !process.env.MAILGUN_DOMAIN) {
    console.log(`[Alert] ${subject}`);
    return;
  }

  try {
    const mailFrom = process.env.MAIL_FROM || `WooMonitor <alerts@${process.env.MAILGUN_DOMAIN}>`;
    await axios.post(
      `https://api.mailgun.net/v3/${process.env.MAILGUN_DOMAIN}/messages`,
      new URLSearchParams({ from: mailFrom, to: process.env.ALERT_EMAIL, subject: `🚨 ${subject}`, text: message }),
      { auth: { username: "api", password: process.env.MAILGUN_API_KEY } }
    );
  } catch (err) {
    console.error("[Alert Email Error]", err.message);
  }
}

module.exports = {
  createAlert,
  getAlerts,
  clearAlerts,
  deleteAlert,
  getAlertStats,
  shouldDeduplicate,
  sendAlertEmail,
};
```

**Step 2: Verify**

Run: `cd server && node -e "const {initDB}=require('./src/db'); initDB(); const a=require('./src/services/alert-service'); const id=a.createAlert({subject:'test',message:'hello',severity:'high'}); console.log('created:', id); console.log(a.getAlerts());"`

Expected: `created: 1` and an object with alerts array containing the test alert.

**Step 3: Commit**

```bash
git add server/src/services/alert-service.js
git commit -m "feat: add alert service with SQLite persistence and deduplication"
```

---

## Task 4: Store Service

**Files:**
- Create: `server/src/services/store-service.js`

**Step 1: Write the store service**

```javascript
const { getDB } = require("../db");

function upsertStore({ id, name, url, consumerKey, consumerSecret, pluginVersion, woocommerceVersion, wordpressVersion, phpVersion }) {
  const db = getDB();
  const existing = db.prepare("SELECT id FROM stores WHERE id = ?").get(id);

  if (existing) {
    const fields = [];
    const params = [];
    if (name) { fields.push("name = ?"); params.push(name); }
    if (url) { fields.push("url = ?"); params.push(url); }
    if (consumerKey) { fields.push("consumer_key = ?"); params.push(consumerKey); }
    if (consumerSecret) { fields.push("consumer_secret = ?"); params.push(consumerSecret); }
    if (pluginVersion) { fields.push("plugin_version = ?"); params.push(pluginVersion); }
    if (woocommerceVersion) { fields.push("woocommerce_version = ?"); params.push(woocommerceVersion); }
    if (wordpressVersion) { fields.push("wordpress_version = ?"); params.push(wordpressVersion); }
    if (phpVersion) { fields.push("php_version = ?"); params.push(phpVersion); }
    fields.push("last_seen = datetime('now')");
    fields.push("updated_at = datetime('now')");
    if (fields.length) {
      db.prepare(`UPDATE stores SET ${fields.join(", ")} WHERE id = ?`).run(...params, id);
    }
    return { action: "updated", id };
  }

  db.prepare(
    `INSERT INTO stores (id, name, url, consumer_key, consumer_secret, plugin_version, woocommerce_version, wordpress_version, php_version, last_seen)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  ).run(id, name, url, consumerKey || null, consumerSecret || null, pluginVersion || null, woocommerceVersion || null, wordpressVersion || null, phpVersion || null);

  // Initialize store_stats
  db.prepare("INSERT OR IGNORE INTO store_stats (store_id) VALUES (?)").run(id);

  return { action: "created", id };
}

function getAllStores() {
  return getDB().prepare("SELECT * FROM stores ORDER BY name").all();
}

function getStore(id) {
  return getDB().prepare("SELECT * FROM stores WHERE id = ?").get(id);
}

function removeStore(id) {
  const db = getDB();
  db.prepare("DELETE FROM store_stats WHERE store_id = ?").run(id);
  return db.prepare("DELETE FROM stores WHERE id = ?").run(id).changes;
}

function updateStoreSettings(id, settings) {
  return getDB().prepare("UPDATE stores SET settings = ?, updated_at = datetime('now') WHERE id = ?")
    .run(JSON.stringify(settings), id).changes;
}

function updateStoreSyncConfig(id, syncConfig) {
  return getDB().prepare("UPDATE stores SET sync_config = ?, updated_at = datetime('now') WHERE id = ?")
    .run(JSON.stringify(syncConfig), id).changes;
}

function updateStoreCredentials(id, consumerKey, consumerSecret) {
  return getDB().prepare("UPDATE stores SET consumer_key = ?, consumer_secret = ?, updated_at = datetime('now') WHERE id = ?")
    .run(consumerKey, consumerSecret, id).changes;
}

function clearStoreCredentials(id) {
  return getDB().prepare("UPDATE stores SET consumer_key = NULL, consumer_secret = NULL, updated_at = datetime('now') WHERE id = ?")
    .run(id).changes;
}

function getStoreStats(storeId) {
  const row = getDB().prepare("SELECT * FROM store_stats WHERE store_id = ?").get(storeId);
  if (!row) return null;
  return {
    ...row,
    features: JSON.parse(row.features || "{}"),
    admin_notices: JSON.parse(row.admin_notices || "[]"),
    error_counts: JSON.parse(row.error_counts || "{}"),
  };
}

function updateStoreStats(storeId, updates) {
  const db = getDB();
  db.prepare("INSERT OR IGNORE INTO store_stats (store_id) VALUES (?)").run(storeId);

  const fields = [];
  const params = [];
  if (updates.features !== undefined) { fields.push("features = ?"); params.push(JSON.stringify(updates.features)); }
  if (updates.healthStatus !== undefined) { fields.push("health_status = ?"); params.push(updates.healthStatus); }
  if (updates.adminNotices !== undefined) { fields.push("admin_notices = ?"); params.push(JSON.stringify(updates.adminNotices)); }
  if (updates.errorCounts !== undefined) { fields.push("error_counts = ?"); params.push(JSON.stringify(updates.errorCounts)); }
  fields.push("updated_at = datetime('now')");

  db.prepare(`UPDATE store_stats SET ${fields.join(", ")} WHERE store_id = ?`).run(...params, storeId);
}

function touchStore(id) {
  getDB().prepare("UPDATE stores SET last_seen = datetime('now') WHERE id = ?").run(id);
}

module.exports = {
  upsertStore,
  getAllStores,
  getStore,
  removeStore,
  updateStoreSettings,
  updateStoreSyncConfig,
  updateStoreCredentials,
  clearStoreCredentials,
  getStoreStats,
  updateStoreStats,
  touchStore,
};
```

**Step 2: Verify**

Run: `cd server && node -e "const {initDB}=require('./src/db'); initDB(); const s=require('./src/services/store-service'); s.upsertStore({id:'test-1',name:'Test Store',url:'https://test.com'}); console.log(s.getAllStores()); console.log(s.getStoreStats('test-1'));"`

Expected: Array with test store, and stats object with defaults.

**Step 3: Commit**

```bash
git add server/src/services/store-service.js
git commit -m "feat: add store service with SQLite persistence"
```

---

## Task 5: Auth Service + Middleware

**Files:**
- Create: `server/src/services/auth-service.js`
- Create: `server/src/middleware/auth.js`

**Step 1: Write auth service**

```javascript
const crypto = require("crypto");
const { getDB } = require("../db");

const ALLOWED_EMAILS = process.env.ALLOWED_EMAILS
  ? process.env.ALLOWED_EMAILS.split(",").map(e => e.trim())
  : ["cameron@ashbi.ca"];
const REQUIRE_AUTH = process.env.REQUIRE_AUTH !== "false";

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateToken() {
  return crypto.randomBytes(48).toString("hex");
}

function createAuthCode(email) {
  if (!ALLOWED_EMAILS.includes(email)) return null;
  const db = getDB();
  const code = generateCode();
  const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min
  db.prepare("INSERT OR REPLACE INTO auth_codes (email, code, expires) VALUES (?, ?, ?)").run(email, code, expires);
  return code;
}

function verifyCode(email, code) {
  const db = getDB();
  const row = db.prepare("SELECT * FROM auth_codes WHERE email = ? AND code = ?").get(email, code);
  if (!row || new Date(row.expires) < new Date()) return null;

  db.prepare("DELETE FROM auth_codes WHERE email = ?").run(email);

  const token = generateToken();
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days
  db.prepare("INSERT INTO auth_tokens (token, email, expires) VALUES (?, ?, ?)").run(token, email, expires);
  return { token, email, expires };
}

function validateToken(token) {
  if (!token) return null;
  const db = getDB();
  const row = db.prepare("SELECT * FROM auth_tokens WHERE token = ?").get(token);
  if (!row || new Date(row.expires) < new Date()) {
    if (row) db.prepare("DELETE FROM auth_tokens WHERE token = ?").run(token);
    return null;
  }
  return { email: row.email, expires: row.expires };
}

function revokeToken(token) {
  return getDB().prepare("DELETE FROM auth_tokens WHERE token = ?").run(token).changes;
}

function cleanupExpired() {
  const db = getDB();
  db.prepare("DELETE FROM auth_tokens WHERE expires < datetime('now')").run();
  db.prepare("DELETE FROM auth_codes WHERE expires < datetime('now')").run();
}

module.exports = {
  ALLOWED_EMAILS,
  REQUIRE_AUTH,
  createAuthCode,
  verifyCode,
  validateToken,
  revokeToken,
  cleanupExpired,
};
```

**Step 2: Write auth middleware**

Create `server/src/middleware/auth.js`:

```javascript
const { validateToken, REQUIRE_AUTH } = require("../services/auth-service");

function authMiddleware(req, res, next) {
  // Skip auth if disabled
  if (!REQUIRE_AUTH) return next();

  // Public endpoints
  const publicPaths = [
    "/api/health",
    "/api/track-woo-error",
    "/api/auth/request-code",
    "/api/auth/verify-code",
  ];
  if (publicPaths.includes(req.path)) return next();
  if (req.path === "/api/stores" && req.method === "POST") return next();

  const token = req.headers["x-auth-token"] || req.cookies?.authToken || req.query?.authToken;
  const auth = validateToken(token);
  if (!auth) return res.status(401).json({ error: "Authentication required" });

  req.user = auth.email;
  next();
}

function apiKeyMiddleware(req, res, next) {
  // GET requests are always allowed
  if (req.method === "GET") return next();

  // Plugin endpoints skip API key check
  if (req.path === "/api/track-woo-error") return next();

  // Check auth token first (dashboard users)
  const authToken = req.headers["x-auth-token"] || req.query?.authToken;
  if (authToken && validateToken(authToken)) return next();

  // Check API key
  const apiKey = req.headers["x-api-key"] || req.query?.apiKey;
  const validApiKey = process.env.API_KEY;
  if (!validApiKey) return next(); // No key configured = dev mode
  if (apiKey === validApiKey) return next();

  return res.status(401).json({ error: "Invalid or missing API key" });
}

module.exports = { authMiddleware, apiKeyMiddleware };
```

**Step 3: Commit**

```bash
git add server/src/services/auth-service.js server/src/middleware/auth.js
git commit -m "feat: add auth service and middleware with SQLite token storage"
```

---

## Task 6: Email Service + Health Checker Service

**Files:**
- Create: `server/src/services/email-service.js`
- Create: `server/src/services/health-checker.js`

**Step 1: Write email service**

```javascript
const axios = require("axios");

async function sendEmail({ to, subject, text }) {
  if (!process.env.MAILGUN_API_KEY || !process.env.MAILGUN_DOMAIN) {
    console.log(`[Email Mock] To: ${to} | Subject: ${subject}`);
    return { mocked: true };
  }

  const mailFrom = process.env.MAIL_FROM || `WooMonitor <alerts@${process.env.MAILGUN_DOMAIN}>`;
  const res = await axios.post(
    `https://api.mailgun.net/v3/${process.env.MAILGUN_DOMAIN}/messages`,
    new URLSearchParams({ from: mailFrom, to, subject, text }),
    { auth: { username: "api", password: process.env.MAILGUN_API_KEY } }
  );
  return res.data;
}

module.exports = { sendEmail };
```

**Step 2: Write health checker**

```javascript
const WooCommerceRestApi = require("@woocommerce/woocommerce-rest-api").default;
const { getAllStores } = require("./store-service");
const { createAlert, shouldDeduplicate, sendAlertEmail } = require("./alert-service");

async function checkStore(store) {
  if (!store.consumer_key || !store.consumer_secret) {
    return { storeId: store.id, status: "skipped", reason: "No API credentials" };
  }

  const api = new WooCommerceRestApi({
    url: store.url,
    consumerKey: store.consumer_key,
    consumerSecret: store.consumer_secret,
    version: "wc/v3",
  });

  try {
    const { data } = await api.get("system_status");

    const issues = [];

    // Check Action Scheduler
    const failedTasks = data.environment?.action_scheduler_status?.failed || 0;
    if (failedTasks > 100) {
      issues.push({ check: "action_scheduler", severity: "critical", detail: `${failedTasks} failed tasks` });
    }

    // Check pending orders
    const pendingOrders = data.database?.pending_orders || 0;
    if (pendingOrders > 50) {
      issues.push({ check: "pending_orders", severity: "high", detail: `${pendingOrders} pending` });
    }

    if (issues.length > 0) {
      const subject = `Health Check: ${store.name} — ${issues.length} issue(s)`;
      const message = issues.map(i => `[${i.severity}] ${i.check}: ${i.detail}`).join("\n");
      const dedupKey = `health_${store.id}`;
      if (!shouldDeduplicate(dedupKey)) {
        createAlert({ subject, message, storeId: store.id, severity: issues[0].severity, type: "health" });
        await sendAlertEmail(subject, message);
      }
    }

    return { storeId: store.id, status: "checked", issues: issues.length };
  } catch (err) {
    return { storeId: store.id, status: "error", error: err.message };
  }
}

async function checkAllStores() {
  const stores = getAllStores();
  console.log(`[Health] Checking ${stores.length} store(s)...`);
  const results = await Promise.allSettled(stores.map(checkStore));
  return results.map(r => r.status === "fulfilled" ? r.value : { status: "error", error: r.reason?.message });
}

module.exports = { checkStore, checkAllStores };
```

**Step 3: Commit**

```bash
git add server/src/services/email-service.js server/src/services/health-checker.js
git commit -m "feat: add email service and health checker"
```

---

## Task 7: API Routes — Tracking (Plugin Compatibility)

**Files:**
- Create: `server/src/routes/tracking.js`

This is the **critical** endpoint. The WordPress plugin sends all events here. The contract must be preserved exactly.

**Step 1: Write the tracking route**

```javascript
const { Router } = require("express");
const { createAlert, shouldDeduplicate, sendAlertEmail } = require("../services/alert-service");
const { upsertStore, getAllStores, getStoreStats, updateStoreStats, touchStore } = require("../services/store-service");

const router = Router();

router.post("/track-woo-error", async (req, res) => {
  try {
    const { type, error_message, site, url, time } = req.body;

    // Find matching store
    const stores = getAllStores();
    const siteObj = stores.find(s =>
      s.url.includes(site) || (site && site.includes(s.url))
    );
    const storeId = siteObj?.id || null;
    if (storeId) touchStore(storeId);

    // --- Dispute alerts ---
    if (type === "dispute_created") {
      const subject = `DISPUTE: ${req.body.dispute_id} on ${req.body.store_name}`;
      const message = [
        `New Stripe dispute detected!`,
        `Store: ${req.body.store_name}`,
        `Dispute ID: ${req.body.dispute_id}`,
        `Order ID: ${req.body.order_id}`,
        `Customer: ${req.body.customer_email}`,
        `Amount: ${req.body.amount} ${req.body.currency}`,
        `Reason: ${req.body.reason}`,
        `Evidence Generated: ${req.body.evidence_generated ? "Yes" : "No"}`,
        `Time: ${req.body.timestamp}`,
      ].join("\n");
      createAlert({ subject, message, storeId, severity: "critical", type: "dispute" });
      await sendAlertEmail(subject, message);
      return res.json({ success: true });
    }

    // --- Health check critical ---
    if (type === "health_check_critical") {
      const subject = `HEALTH CHECK CRITICAL: ${req.body.store_name}`;
      let message = `Critical health issues detected!\nStore: ${req.body.store_name}\nURL: ${req.body.store_url}\n\nCritical Issues:\n`;
      (req.body.critical_checks || []).forEach((check, i) => {
        message += `${i + 1}. ${check.name}\n`;
        Object.entries(check.details || {}).forEach(([key, val]) => { message += `   - ${key}: ${val}\n`; });
      });
      const matchedStore = stores.find(s => s.url.includes(req.body.store_url) || req.body.store_url?.includes(s.url));
      createAlert({ subject, message, storeId: matchedStore?.id || null, severity: "critical", type: "health" });
      await sendAlertEmail(subject, message);
      return res.json({ success: true });
    }

    // --- Plugin activated ---
    if (type === "plugin_activated") {
      upsertStore({
        id: req.body.store_id,
        name: req.body.store_name,
        url: req.body.store_url,
        consumerKey: req.body.consumerKey,
        consumerSecret: req.body.consumerSecret,
        pluginVersion: req.body.plugin_version,
        woocommerceVersion: req.body.woocommerce_version,
        wordpressVersion: req.body.wordpress_version,
        phpVersion: req.body.php_version,
      });
      if (req.body.features) {
        updateStoreStats(req.body.store_id, { features: req.body.features });
      }
      const subject = `PLUGIN ACTIVATED: ${req.body.store_name}`;
      const message = `Store: ${req.body.store_name}\nURL: ${req.body.store_url}\nPlugin: ${req.body.plugin_version}\nWooCommerce: ${req.body.woocommerce_version}`;
      createAlert({ subject, message, storeId: req.body.store_id, severity: "success", type: "lifecycle" });
      return res.json({ success: true });
    }

    // --- Plugin deactivated ---
    if (type === "plugin_deactivated") {
      const subject = `PLUGIN DEACTIVATED: ${req.body.store_name}`;
      const message = `Store: ${req.body.store_name}\nURL: ${req.body.store_url}\nTime: ${req.body.timestamp}`;
      createAlert({ subject, message, storeId: siteObj?.id || null, severity: "warning", type: "lifecycle" });
      return res.json({ success: true });
    }

    // --- Subscription cancelled ---
    if (type === "subscription_cancelled") {
      const subject = `Subscription Cancelled: ${req.body.store_name}`;
      const message = `Subscription #${req.body.subscription_id}\nCustomer: ${req.body.customer_name} (${req.body.customer_email})\nProduct: ${req.body.product_name}\nTotal: ${req.body.total}\nCancelled By: ${req.body.cancelled_by}`;
      const matchedStore = stores.find(s => s.url.includes(req.body.store_url) || req.body.store_url?.includes(s.url));
      createAlert({ subject, message, storeId: matchedStore?.id || null, severity: "medium", type: "subscription" });
      return res.json({ success: true });
    }

    // --- Subscription price adjustment ---
    if (type === "subscription_price_adjustment") {
      const emoji = req.body.status === "charged" ? "charged" : "pending";
      const subject = `Price Adjustment (${emoji}): ${req.body.store_name}`;
      const message = `Subscription #${req.body.subscription_id}\nAmount: ${req.body.amount}\nStatus: ${req.body.status}\nTrigger: ${req.body.trigger}\nTime: ${req.body.timestamp}`;
      const severity = req.body.status === "charged" ? "success" : "high";
      const matchedStore = stores.find(s => s.url.includes(req.body.store_url) || req.body.store_url?.includes(s.url));
      createAlert({ subject, message, storeId: matchedStore?.id || null, severity, type: "subscription" });
      return res.json({ success: true });
    }

    // --- Admin notice ---
    if (type === "admin_notice") {
      const stats = getStoreStats(req.body.store_id);
      const notices = stats?.admin_notices || [];
      notices.unshift({ type: req.body.notice_type, message: req.body.message, timestamp: req.body.timestamp });
      if (notices.length > 20) notices.length = 20;
      updateStoreStats(req.body.store_id, { adminNotices: notices });

      const subject = `Admin Notice: ${req.body.notice_type} on ${req.body.store_name}`;
      createAlert({ subject, message: req.body.message, storeId: req.body.store_id, severity: "medium", type: "admin_notice" });
      return res.json({ success: true });
    }

    // --- Regular frontend errors ---
    const dedupKey = `error_${site}_${type}_${(error_message || "").substring(0, 50)}`;
    if (shouldDeduplicate(dedupKey)) {
      return res.json({ success: true, deduplicated: true });
    }

    let severity = "high";
    let category = "Frontend Issue";
    if (type === "javascript_error") category = "JavaScript Error";
    else if (type === "checkout_error") { category = "Checkout Error"; severity = "critical"; }
    else if (type === "ajax_add_to_cart_error") category = "Add to Cart Error";

    const subject = `${category} on ${site}: ${type}`;
    const message = `Site: ${site}\nURL: ${url || "Unknown"}\nError: ${error_message}\nTime: ${time || new Date().toISOString()}`;
    createAlert({ subject, message, storeId, severity, type: "error" });
    await sendAlertEmail(subject, message);

    return res.json({ success: true });
  } catch (err) {
    console.error("[Tracking Error]", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
```

**Step 2: Wire into app.js**

Update `server/src/app.js` to mount the route:

```javascript
// After middleware setup, before static files:
app.use("/api", require("./routes/tracking"));
```

**Step 3: Test with curl**

```bash
curl -s -X POST http://localhost:3000/api/track-woo-error \
  -H "Content-Type: application/json" \
  -d '{"type":"plugin_activated","store_id":"test-curl","store_name":"Curl Test","store_url":"https://curltest.com","plugin_version":"4.5.1","woocommerce_version":"10.5.3","timestamp":"2026-03-09T00:00:00Z"}'
```

Expected: `{"success":true}`

Verify store was created:
```bash
curl -s http://localhost:3000/api/stores
```

**Step 4: Commit**

```bash
git add server/src/routes/tracking.js server/src/app.js
git commit -m "feat: add tracking route (plugin-compatible /api/track-woo-error)"
```

---

## Task 8: API Routes — Stores, Alerts, Dashboard, Auth, Chat, System

**Files:**
- Create: `server/src/routes/stores.js`
- Create: `server/src/routes/alerts.js`
- Create: `server/src/routes/dashboard.js`
- Create: `server/src/routes/auth.js`
- Create: `server/src/routes/chat.js`
- Create: `server/src/routes/system.js`

This task creates all remaining routes. Each route is small because the logic lives in services.

**Step 1: Write routes/stores.js**

```javascript
const { Router } = require("express");
const WooCommerceRestApi = require("@woocommerce/woocommerce-rest-api").default;
const storeService = require("../services/store-service");

const router = Router();

router.get("/stores", (req, res) => {
  const stores = storeService.getAllStores();
  res.json({
    status: "ok",
    stores: stores.map(s => ({
      id: s.id, name: s.name, url: s.url,
      hasApiCredentials: !!(s.consumer_key && s.consumer_secret),
      plugin_version: s.plugin_version,
      woocommerce_version: s.woocommerce_version,
      last_seen: s.last_seen,
    })),
  });
});

router.get("/stores/:id", (req, res) => {
  const store = storeService.getStore(req.params.id);
  if (!store) return res.status(404).json({ error: "Store not found" });
  const stats = storeService.getStoreStats(req.params.id);
  res.json({
    ...store,
    consumer_key: store.consumer_key ? "••••••••" : null,
    consumer_secret: store.consumer_secret ? "••••••••" : null,
    settings: JSON.parse(store.settings || "{}"),
    sync_config: JSON.parse(store.sync_config || "{}"),
    stats,
  });
});

router.post("/stores", (req, res) => {
  const { id, name, url, consumerKey, consumerSecret } = req.body;
  if (!name || !url) return res.status(400).json({ error: "name and url required" });
  const storeId = id || `store-${require("crypto").randomBytes(4).toString("hex")}`;
  const result = storeService.upsertStore({ id: storeId, name, url, consumerKey, consumerSecret });
  res.json({ success: true, ...result });
});

router.post("/stores/remove", (req, res) => {
  const { storeId } = req.body;
  if (!storeId) return res.status(400).json({ error: "storeId required" });
  storeService.removeStore(storeId);
  res.json({ success: true, message: `Store ${storeId} removed` });
});

router.patch("/stores/:id", (req, res) => {
  const store = storeService.getStore(req.params.id);
  if (!store) return res.status(404).json({ error: "Store not found" });
  storeService.upsertStore({ id: req.params.id, ...req.body });
  res.json({ success: true });
});

router.patch("/stores/:id/settings", (req, res) => {
  storeService.updateStoreSettings(req.params.id, req.body);
  res.json({ success: true });
});

router.patch("/stores/:id/sync", (req, res) => {
  storeService.updateStoreSyncConfig(req.params.id, req.body);
  res.json({ success: true });
});

router.post("/stores/:id/credentials", (req, res) => {
  const { consumerKey, consumerSecret } = req.body;
  storeService.updateStoreCredentials(req.params.id, consumerKey, consumerSecret);
  res.json({ success: true });
});

router.delete("/stores/:id/credentials", (req, res) => {
  storeService.clearStoreCredentials(req.params.id);
  res.json({ success: true });
});

router.post("/stores/:id/test-api", async (req, res) => {
  const store = storeService.getStore(req.params.id);
  if (!store) return res.status(404).json({ error: "Store not found" });
  const key = req.body.consumerKey || store.consumer_key;
  const secret = req.body.consumerSecret || store.consumer_secret;
  if (!key || !secret) return res.status(400).json({ error: "No API credentials" });

  try {
    const api = new WooCommerceRestApi({ url: store.url, consumerKey: key, consumerSecret: secret, version: "wc/v3" });
    const { data } = await api.get("system_status");
    res.json({ success: true, store: store.name, woocommerce_version: data.environment?.version, message: "Connection successful" });
  } catch (err) {
    res.status(502).json({ success: false, error: err.message });
  }
});

module.exports = router;
```

**Step 2: Write routes/alerts.js**

```javascript
const { Router } = require("express");
const alertService = require("../services/alert-service");

const router = Router();

router.get("/dashboard/alerts", (req, res) => {
  const { storeId, severity, type, limit, offset } = req.query;
  const result = alertService.getAlerts({
    storeId, severity, type,
    limit: parseInt(limit) || 100,
    offset: parseInt(offset) || 0,
  });
  res.json(result);
});

router.post("/dashboard/clear-alerts", (req, res) => {
  const cleared = alertService.clearAlerts(req.body);
  res.json({ status: "ok", cleared });
});

router.post("/dashboard/clear-old-alerts", (req, res) => {
  const days = req.body.days || 30;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const cleared = alertService.clearAlerts({ olderThan: cutoff });
  res.json({ status: "ok", cleared, message: `Cleared alerts older than ${days} days` });
});

router.delete("/dashboard/alerts/:id", (req, res) => {
  alertService.deleteAlert(req.params.id);
  res.json({ success: true });
});

module.exports = router;
```

**Step 3: Write routes/dashboard.js**

```javascript
const { Router } = require("express");
const storeService = require("../services/store-service");
const alertService = require("../services/alert-service");

const router = Router();

router.get("/dashboard", (req, res) => {
  const stores = storeService.getAllStores();
  const { alerts: recentAlerts, total: totalAlerts } = alertService.getAlerts({ limit: 100 });
  const stats = alertService.getAlertStats();

  const enhancedStores = stores.map(store => {
    const storeStats = storeService.getStoreStats(store.id);
    const lastSeen = store.last_seen ? new Date(store.last_seen) : null;
    const hoursAgo = lastSeen ? (Date.now() - lastSeen.getTime()) / (1000 * 60 * 60) : Infinity;
    let healthStatus = "unknown";
    if (hoursAgo < 2) healthStatus = "excellent";
    else if (hoursAgo < 24) healthStatus = "good";
    else if (hoursAgo < 72) healthStatus = "warning";
    else if (lastSeen) healthStatus = "critical";

    return {
      id: store.id, name: store.name, url: store.url,
      hasApiCredentials: !!(store.consumer_key && store.consumer_secret),
      plugin_version: store.plugin_version || "unknown",
      woocommerce_version: store.woocommerce_version || "unknown",
      last_seen: store.last_seen,
      health_status: healthStatus,
      features: storeStats?.features || {},
      alert_counts: {
        total: storeStats?.error_counts?.total || 0,
        errors: storeStats?.error_counts?.errors || 0,
        disputes: storeStats?.error_counts?.disputes || 0,
      },
    };
  });

  // Health distribution
  const healthDistribution = { excellent: 0, good: 0, warning: 0, critical: 0, unknown: 0 };
  enhancedStores.forEach(s => healthDistribution[s.health_status]++);

  // Alert trends (7 days)
  const db = require("../db").getDB();
  const alertTrends = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split("T")[0];
    const row = db.prepare(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN severity='critical' THEN 1 ELSE 0 END) as critical,
              SUM(CASE WHEN severity='high' THEN 1 ELSE 0 END) as high,
              SUM(CASE WHEN severity='medium' THEN 1 ELSE 0 END) as medium
       FROM alerts WHERE date(timestamp) = ?`
    ).get(dateStr);
    alertTrends.push({ date: dateStr, total: row.total, critical: row.critical, high: row.high, medium: row.medium });
  }

  res.json({
    status: "ok",
    version: "3.0.0",
    overview: {
      totalSites: stores.length,
      totalAlerts,
      criticalAlerts: stats.bySeverity.critical || 0,
      highAlerts: stats.bySeverity.high || 0,
      mediumAlerts: stats.bySeverity.medium || 0,
      healthDistribution,
      storesWithApi: stores.filter(s => s.consumer_key && s.consumer_secret).length,
      alertTrends,
      uptime: process.uptime(),
    },
    stores: enhancedStores,
    recentAlerts,
  });
});

module.exports = router;
```

**Step 4: Write routes/auth.js**

```javascript
const { Router } = require("express");
const authService = require("../services/auth-service");
const { sendEmail } = require("../services/email-service");

const router = Router();

router.post("/auth/request-code", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email required" });

  const code = authService.createAuthCode(email);
  if (!code) return res.status(403).json({ error: "Email not authorized" });

  await sendEmail({
    to: email,
    subject: `WooMonitor Login Code: ${code}`,
    text: `Your 6-digit login code is: ${code}\n\nExpires in 10 minutes.`,
  });

  res.json({ success: true, message: "Code sent" });
});

router.post("/auth/verify-code", (req, res) => {
  const { email, code } = req.body;
  const result = authService.verifyCode(email, code);
  if (!result) return res.status(401).json({ error: "Invalid or expired code" });
  res.json(result);
});

router.get("/auth/me", (req, res) => {
  const token = req.headers["x-auth-token"] || req.query?.authToken;
  const auth = authService.validateToken(token);
  if (!auth) return res.status(401).json({ error: "Not authenticated" });
  res.json(auth);
});

router.post("/auth/logout", (req, res) => {
  const token = req.headers["x-auth-token"] || req.query?.authToken;
  if (token) authService.revokeToken(token);
  res.clearCookie("authToken");
  res.json({ success: true });
});

module.exports = router;
```

**Step 5: Write routes/chat.js**

```javascript
const { Router } = require("express");
const axios = require("axios");

const router = Router();

router.post("/chat/deepseek", async (req, res) => {
  const { question, storeData, chatHistory } = req.body;
  if (!question) return res.status(400).json({ error: "question required" });

  const systemPrompt = `You are an expert WooCommerce store analyst. You help diagnose issues, suggest fixes, and explain store metrics. Be concise and actionable. Use markdown formatting.`;

  const messages = [{ role: "system", content: systemPrompt }];
  if (storeData) {
    messages.push({ role: "system", content: `Store context:\n${JSON.stringify(storeData, null, 2)}` });
  }
  if (chatHistory) {
    chatHistory.slice(-5).forEach(m => messages.push({ role: m.role, content: m.content }));
  }
  messages.push({ role: "user", content: question });

  if (!process.env.DEEPSEEK_API_KEY || process.env.USE_MOCK_AI === "true") {
    return res.json({ response: `**Mock AI Response**\n\nYou asked: "${question}"\n\nDeepSeek API key not configured. Set DEEPSEEK_API_KEY in .env to enable AI chat.` });
  }

  try {
    const { data } = await axios.post(
      "https://api.deepseek.com/chat/completions",
      { model: "deepseek-chat", messages, max_tokens: 2048 },
      { headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`, "Content-Type": "application/json" } }
    );
    res.json({ response: data.choices[0].message.content });
  } catch (err) {
    res.status(502).json({ error: "AI service unavailable: " + err.message });
  }
});

module.exports = router;
```

**Step 6: Write routes/system.js**

```javascript
const { Router } = require("express");
const storeService = require("../services/store-service");
const alertService = require("../services/alert-service");
const { checkAllStores } = require("../services/health-checker");
const authService = require("../services/auth-service");

const router = Router();

router.get("/health", (req, res) => {
  const stores = storeService.getAllStores();
  const { total } = alertService.getAlertStats();
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "3.0.0",
    stores: stores.length,
    total_alerts: total,
    uptime: process.uptime(),
    features: {
      frontend_monitoring: true,
      backend_health_checks: true,
      email_alerts: !!(process.env.MAILGUN_API_KEY),
      dashboard_api: true,
      store_statistics: true,
      feature_tracking: true,
      sites_monitored: stores.length,
    },
  });
});

router.get("/system/config", (req, res) => {
  res.json({
    allowed_emails: authService.ALLOWED_EMAILS,
    require_auth: authService.REQUIRE_AUTH,
    mailgun_configured: !!(process.env.MAILGUN_API_KEY),
    deepseek_configured: !!(process.env.DEEPSEEK_API_KEY),
    environment: process.env.NODE_ENV || "development",
    server_version: "3.0.0",
    node_version: process.version,
    memory: process.memoryUsage(),
    uptime: process.uptime(),
  });
});

router.post("/health-check-all", async (req, res) => {
  const results = await checkAllStores();
  res.json({ success: true, results });
});

router.post("/test-connections", async (req, res) => {
  const results = await checkAllStores();
  res.json({ success: true, results });
});

router.get("/export/all", (req, res) => {
  const stores = storeService.getAllStores().map(s => ({
    ...s,
    consumer_key: s.consumer_key ? "REDACTED" : null,
    consumer_secret: s.consumer_secret ? "REDACTED" : null,
  }));
  const { alerts } = alertService.getAlerts({ limit: 1000 });
  res.json({ exported_at: new Date().toISOString(), stores, alerts });
});

module.exports = router;
```

**Step 7: Wire all routes into app.js**

Update `server/src/app.js`:

```javascript
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

  // Serve React dashboard
  const dashboardPath = path.join(__dirname, "../dashboard/dist");
  app.use(express.static(dashboardPath));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(dashboardPath, "index.html"));
  });

  return app;
}

module.exports = { createApp };
```

Update `server/src/index.js` to add cron:

```javascript
require("dotenv").config();
const { initDB } = require("./db");
const { createApp } = require("./app");
const cron = require("node-cron");
const { checkAllStores } = require("./services/health-checker");
const { cleanupExpired } = require("./services/auth-service");

const PORT = process.env.PORT || 3000;

initDB();
const app = createApp();

// Health checks every 15 minutes
cron.schedule("*/15 * * * *", () => checkAllStores());

// Cleanup expired tokens daily
cron.schedule("0 3 * * *", () => cleanupExpired());

app.listen(PORT, () => {
  console.log(`Woo Monitor v3.0.0 listening on port ${PORT}`);
  console.log(`Dashboard: http://localhost:${PORT}/dashboard`);
  // Run initial health check
  setTimeout(() => checkAllStores(), 5000);
});
```

**Step 8: Test all endpoints**

```bash
# Health
curl -s http://localhost:3000/api/health | jq .status
# Expected: "ok"

# Register a store via plugin endpoint
curl -s -X POST http://localhost:3000/api/track-woo-error \
  -H "Content-Type: application/json" \
  -d '{"type":"plugin_activated","store_id":"s1","store_name":"Test","store_url":"https://test.com","plugin_version":"4.5.1","woocommerce_version":"10.5.3"}'
# Expected: {"success":true}

# Dashboard data
curl -s http://localhost:3000/api/dashboard | jq '.overview.totalSites'
# Expected: 1

# Stores list
curl -s http://localhost:3000/api/stores | jq '.stores | length'
# Expected: 1
```

**Step 9: Commit**

```bash
git add server/src/routes/ server/src/app.js server/src/index.js
git commit -m "feat: add all API routes (stores, alerts, dashboard, auth, chat, system)"
```

---

## Task 9: Migrate Existing Data

**Files:**
- Create: `server/src/migrate-from-json.js`

One-time script to import data from the old `sites.json` into SQLite.

**Step 1: Write migration script**

```javascript
const fs = require("fs");
const path = require("path");
const { initDB } = require("./db");
const storeService = require("./services/store-service");

const sitesPath = path.join(__dirname, "../sites.json");
if (!fs.existsSync(sitesPath)) {
  console.log("No sites.json found, nothing to migrate.");
  process.exit(0);
}

initDB();
const sites = JSON.parse(fs.readFileSync(sitesPath, "utf8"));
console.log(`Migrating ${sites.length} stores from sites.json...`);

sites.forEach(site => {
  storeService.upsertStore({
    id: site.id,
    name: site.name,
    url: site.url,
    consumerKey: site.consumerKey,
    consumerSecret: site.consumerSecret,
    pluginVersion: site.plugin_version,
    woocommerceVersion: site.woocommerce_version,
    wordpressVersion: site.wordpress_version,
    phpVersion: site.php_version,
  });
  console.log(`  ✓ ${site.name} (${site.url})`);
});

console.log("Migration complete.");
```

**Step 2: Run it**

```bash
cd server && node src/migrate-from-json.js
```

Expected: 3 stores migrated.

**Step 3: Commit**

```bash
git add server/src/migrate-from-json.js
git commit -m "feat: add one-time migration script from sites.json to SQLite"
```

---

## Task 10: React Dashboard — Layout, Routing, API Client

**Files:**
- Create: `server/dashboard/src/api/client.js`
- Create: `server/dashboard/src/components/Layout.jsx`
- Create: `server/dashboard/src/pages/Overview.jsx`
- Create: `server/dashboard/src/pages/Stores.jsx`
- Create: `server/dashboard/src/pages/Alerts.jsx`
- Create: `server/dashboard/src/pages/Chat.jsx`
- Create: `server/dashboard/src/pages/System.jsx`
- Modify: `server/dashboard/src/App.jsx`

**Step 1: Write API client**

```javascript
const BASE = "";

function getAuthToken() {
  return localStorage.getItem("authToken") || null;
}

export async function apiFetch(url, options = {}) {
  const token = getAuthToken();
  const headers = { ...options.headers };
  if (token) headers["x-auth-token"] = token;

  const res = await fetch(`${BASE}${url}`, { ...options, headers });
  if (res.status === 401) {
    localStorage.removeItem("authToken");
    window.location.href = "/dashboard";
    throw new Error("Authentication required");
  }
  return res;
}

export async function api(url, options) {
  const res = await apiFetch(url, options);
  return res.json();
}

export async function apiPost(url, body) {
  return api(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
```

**Step 2: Write Layout component**

```jsx
import { NavLink, Outlet } from "react-router-dom";

const tabs = [
  { to: "/dashboard", label: "Overview", icon: "📊" },
  { to: "/dashboard/stores", label: "Stores", icon: "🏪" },
  { to: "/dashboard/alerts", label: "Alerts", icon: "📨" },
  { to: "/dashboard/chat", label: "AI Chat", icon: "💬" },
  { to: "/dashboard/system", label: "System", icon: "⚙️" },
];

export default function Layout() {
  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-gradient-to-r from-slate-800 to-blue-600 text-white p-6 rounded-b-xl">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">WooCommerce Monitor</h1>
            <p className="text-white/70 text-sm">Multi-store monitoring & dispute protection</p>
          </div>
        </div>
        <nav className="max-w-7xl mx-auto mt-4 flex gap-2">
          {tabs.map(t => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.to === "/dashboard"}
              className={({ isActive }) =>
                `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? "bg-white text-slate-800" : "text-white/80 hover:bg-white/10"
                }`
              }
            >
              {t.icon} {t.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="max-w-7xl mx-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
```

**Step 3: Write placeholder pages**

Each page will be fleshed out in subsequent tasks. For now, create minimal versions.

`pages/Overview.jsx`:
```jsx
import { useEffect, useState } from "react";
import { api } from "../api/client";

export default function Overview() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api("/api/dashboard").then(setData).catch(e => setError(e.message));
  }, []);

  if (error) return <div className="text-red-600">Error: {error}</div>;
  if (!data) return <div className="text-gray-500">Loading...</div>;

  const o = data.overview;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Stores" value={o.totalSites} />
        <StatCard label="Total Alerts" value={o.totalAlerts} />
        <StatCard label="Critical" value={o.criticalAlerts} color={o.criticalAlerts > 0 ? "red" : "green"} />
        <StatCard label="High" value={o.highAlerts} color={o.highAlerts > 0 ? "orange" : "green"} />
      </div>
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-4">Stores</h2>
        <div className="grid md:grid-cols-3 gap-4">
          {data.stores.map(s => (
            <div key={s.id} className="border rounded-lg p-4 hover:border-blue-400 transition-colors">
              <h3 className="font-medium">{s.name}</h3>
              <p className="text-sm text-gray-500">{s.url}</p>
              <div className="mt-2 flex gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  s.health_status === "excellent" ? "bg-green-100 text-green-700" :
                  s.health_status === "good" ? "bg-blue-100 text-blue-700" :
                  s.health_status === "warning" ? "bg-yellow-100 text-yellow-700" :
                  s.health_status === "critical" ? "bg-red-100 text-red-700" :
                  "bg-gray-100 text-gray-700"
                }`}>
                  {s.health_status}
                </span>
                {s.hasApiCredentials && <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">API</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color = "blue" }) {
  const colors = {
    blue: "text-blue-600", red: "text-red-600", green: "text-green-600", orange: "text-orange-600",
  };
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`text-3xl font-bold ${colors[color]}`}>{value}</p>
    </div>
  );
}
```

`pages/Stores.jsx`, `pages/Alerts.jsx`, `pages/Chat.jsx`, `pages/System.jsx`:

Create each as a simple placeholder:
```jsx
export default function PageName() {
  return <div className="bg-white rounded-xl p-6 shadow-sm">
    <h2 className="text-lg font-semibold">Page Name</h2>
    <p className="text-gray-500">Coming next...</p>
  </div>;
}
```

**Step 4: Wire up routing in App.jsx**

```jsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import Overview from "./pages/Overview";
import Stores from "./pages/Stores";
import Alerts from "./pages/Alerts";
import Chat from "./pages/Chat";
import System from "./pages/System";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/dashboard" element={<Layout />}>
          <Route index element={<Overview />} />
          <Route path="stores" element={<Stores />} />
          <Route path="alerts" element={<Alerts />} />
          <Route path="chat" element={<Chat />} />
          <Route path="system" element={<System />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" />} />
      </Routes>
    </BrowserRouter>
  );
}
```

**Step 5: Test**

Run both servers. Visit http://localhost:5173/dashboard. Expect:
- Header with nav tabs
- Overview page with 4 stat cards and store grid
- Clicking tabs navigates between pages

**Step 6: Commit**

```bash
git add server/dashboard/src/
git commit -m "feat: add React dashboard with routing, layout, and overview page"
```

---

## Task 11: React Dashboard — Stores Page (Full CRUD)

**Files:**
- Create: `server/dashboard/src/pages/Stores.jsx`
- Create: `server/dashboard/src/components/StoreCard.jsx`
- Create: `server/dashboard/src/components/AddStoreModal.jsx`
- Create: `server/dashboard/src/components/StoreDetailModal.jsx`

This task builds the full store management UI: list, add, view details, edit settings, manage credentials, remove.

Code is not written inline here due to length — implement based on these specs:

**StoreCard**: Shows name, URL, health badge, plugin version, last seen, feature badges, "View Details" button.

**AddStoreModal**: Form with name, URL, optional consumer key/secret. POST to `/api/stores`. Close and refresh on success.

**StoreDetailModal**: Tabbed modal (Info, Settings, API Credentials, Sync Config). Each tab loads/saves to the corresponding API endpoint. "Test Connection" button. "Remove Store" with confirmation.

**Stores page**: Grid of StoreCards + "Add Store" button that opens AddStoreModal. Click card opens StoreDetailModal.

**Step: Commit**

```bash
git add server/dashboard/src/pages/Stores.jsx server/dashboard/src/components/
git commit -m "feat: add stores page with full CRUD, settings, and credentials management"
```

---

## Task 12: React Dashboard — Alerts Page

**Files:**
- Modify: `server/dashboard/src/pages/Alerts.jsx`

Build alert management: filterable list, severity color coding, delete individual, clear all, export CSV.

**Specs:**
- Filter bar: store dropdown, severity dropdown, type dropdown
- Alert list with timestamp, subject, message preview, severity badge
- Delete button per alert (DELETE `/api/dashboard/alerts/:id`)
- "Clear All" button with confirmation (POST `/api/dashboard/clear-alerts`)
- "Export CSV" button — client-side CSV generation and download
- Auto-refresh every 60 seconds

**Step: Commit**

```bash
git add server/dashboard/src/pages/Alerts.jsx
git commit -m "feat: add alerts page with filtering, export, and management"
```

---

## Task 13: React Dashboard — Charts (Overview Enhancement)

**Files:**
- Create: `server/dashboard/src/components/AlertTrendsChart.jsx`
- Create: `server/dashboard/src/components/HealthDistribution.jsx`
- Modify: `server/dashboard/src/pages/Overview.jsx`

**Specs:**
- Alert Trends: Line chart (react-chartjs-2) showing 7-day alert trends (total, critical, high)
- Health Distribution: Visual grid showing store health breakdown
- Recent Activity: Last 5 alerts with severity icons
- Add auto-refresh every 60 seconds to Overview

**Step: Commit**

```bash
git add server/dashboard/src/components/ server/dashboard/src/pages/Overview.jsx
git commit -m "feat: add charts and enhanced overview with real metrics"
```

---

## Task 14: React Dashboard — AI Chat Page

**Files:**
- Modify: `server/dashboard/src/pages/Chat.jsx`

**Specs:**
- Store selector dropdown (loads from `/api/stores`)
- "Load Store Data" button — fetches store details and recent alerts
- Chat message list with user/assistant styling
- Input textarea with Enter to send
- Sends to POST `/api/chat/deepseek` with question, storeData, chatHistory
- Markdown rendering for AI responses
- "Clear Chat" button

**Step: Commit**

```bash
git add server/dashboard/src/pages/Chat.jsx
git commit -m "feat: add AI chat page with DeepSeek integration"
```

---

## Task 15: React Dashboard — System Page

**Files:**
- Modify: `server/dashboard/src/pages/System.jsx`

**Specs:**
- Server info card: version, uptime (formatted), memory usage (real `process.memoryUsage()`), connected stores, total alerts
- Auth status card: current user, session expiry (if auth enabled)
- Quick actions: Run Health Checks, Clear Old Alerts, Export Data, Reload Config
- All actions use real API endpoints, show toast on success/failure

No placeholder buttons. Only show actions that actually work.

**Step: Commit**

```bash
git add server/dashboard/src/pages/System.jsx
git commit -m "feat: add system page with real server metrics and actions"
```

---

## Task 16: Build Pipeline + Updated Dockerfile

**Files:**
- Modify: `Dockerfile`
- Modify: `server/package.json`

**Step 1: Update Dockerfile**

```dockerfile
FROM node:18-alpine AS dashboard-build
WORKDIR /build
COPY server/dashboard/package*.json ./
RUN npm ci
COPY server/dashboard/ .
RUN npm run build

FROM node:18-alpine
WORKDIR /usr/src/app

COPY server/package*.json ./
RUN npm ci --only=production

COPY server/src/ ./src/
COPY server/migrations/ ./migrations/
COPY --from=dashboard-build /build/dist ./dashboard/dist

RUN mkdir -p /usr/src/app/data && \
    addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /usr/src/app
USER nodejs

EXPOSE 3000

VOLUME /usr/src/app/data

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

CMD ["node", "src/index.js"]
```

**Step 2: Test Docker build**

```bash
cd woo-comprehensive-monitor && docker build -t woo-monitor:3.0 .
docker run -p 3000:3000 -v woo-data:/usr/src/app/data woo-monitor:3.0
```

Visit http://localhost:3000/dashboard — should serve the built React app.

**Step 3: Commit**

```bash
git add Dockerfile server/package.json
git commit -m "feat: multi-stage Dockerfile with React build and SQLite volume"
```

---

## Task 17: End-to-End Verification

**Run the full stack locally:**

```bash
cd server && node src/migrate-from-json.js  # Import existing stores
cd server && node src/index.js &             # Start API
cd server/dashboard && npm run dev           # Start Vite dev
```

**Verify checklist:**

1. `GET /api/health` — returns status ok with store count
2. `GET /api/dashboard` — returns stores, alerts, overview
3. Visit dashboard — Overview shows stats, stores, charts
4. Stores tab — shows all stores, can add new store, view details
5. Alerts tab — shows alerts, can filter and delete
6. Chat tab — can send message, gets response (mock or real)
7. System tab — shows real uptime, memory, store count
8. `POST /api/track-woo-error` with `plugin_activated` — new store appears
9. `POST /api/track-woo-error` with `dispute_created` — alert appears
10. Docker build — `docker build` succeeds, container serves dashboard

**Step: Final commit**

```bash
git add -A
git commit -m "feat: woo-monitor v3.0.0 — full rebuild with React + SQLite"
```

---

## Verification

After all tasks complete:

1. **Plugin compatibility**: Send the same POST requests the WordPress plugin sends. All must return `{"success":true}`.
2. **Data persistence**: Restart the server. Stores and alerts must survive.
3. **Docker**: Build image, run with volume mount, verify dashboard loads and data persists across container restarts.
4. **Live deploy**: Push to GitHub, Coolify auto-deploys. Run migration script inside container to import existing `sites.json` data. Verify https://woo.ashbi.ca/dashboard shows all stores.
