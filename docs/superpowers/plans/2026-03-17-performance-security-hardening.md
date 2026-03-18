# Performance & Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate CPU spikes, harden security, and add observability to the WooCommerce monitor app.

**Architecture:** Targeted improvements to the existing Express + SQLite + node-cron stack. No new databases or infrastructure — just smarter scheduling, caching, security headers, credential encryption, tracking endpoint verification, cache TTLs, and cron telemetry.

**Tech Stack:** Node.js, Express 5, better-sqlite3, helmet, crypto (built-in)

---

### Task 1: Add Helmet.js for HTTP Security Headers

**Files:**
- Modify: `server/package.json`
- Modify: `server/src/app.js`

- [ ] **Step 1: Install helmet**

```bash
cd /c/Users/camst/woo-comprehensive-monitor/server && npm install helmet
```

- [ ] **Step 2: Add helmet middleware to app.js**

In `server/src/app.js`, add after the `require` block at the top:

```js
const helmet = require("helmet");
```

Then add as the first middleware inside `createApp()`, before CORS:

```js
  // Security headers — CSP allows inline styles/scripts for React SPA
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", process.env.APP_FQDN || "https://app.influencerslink.com"],
      },
    },
    crossOriginEmbedderPolicy: false, // breaks loading external images
  }));
```

- [ ] **Step 3: Verify server starts**

```bash
cd /c/Users/camst/woo-comprehensive-monitor/server && node -e "require('./src/app').createApp(); console.log('OK')"
```
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add server/package.json server/package-lock.json server/src/app.js
git commit -m "security: add helmet.js for HTTP security headers"
```

---

### Task 2: Add HMAC Signature Verification to Tracking Endpoint

**Files:**
- Modify: `server/src/routes/tracking.js`
- Modify: `server/src/app.js`

The tracking endpoint (`POST /api/track-woo-error`) is currently wide open — any client that knows the URL can send fake events. Add optional HMAC-SHA256 signature verification using a shared secret (`TRACKING_SECRET` env var). When the env var is set, requests without a valid signature are rejected. When unset, the endpoint stays open (backward compatible).

- [ ] **Step 1: Add raw body capture middleware in app.js**

HMAC verification needs the raw request body. Add a `verify` callback to `express.json()` in `app.js`:

```js
  app.use(express.json({
    limit: "200kb",
    verify: (req, _res, buf) => {
      // Store raw body for HMAC verification on tracking endpoint
      // Note: at this middleware level, req.url is the full path (not mount-relative)
      if (req.url === "/api/track-woo-error") {
        req.rawBody = buf;
      }
    },
  }));
```

Replace the existing `app.use(express.json({ limit: "200kb" }));` line.

- [ ] **Step 2: Add signature verification to tracking.js**

At the top of `tracking.js`, add after existing requires:

```js
const crypto = require("crypto");
const TRACKING_SECRET = process.env.TRACKING_SECRET || "";
```

Then add signature check at the start of the POST handler, right after `try {`:

```js
    // HMAC signature verification (when TRACKING_SECRET is configured)
    if (TRACKING_SECRET) {
      const sig = req.headers["x-wcm-signature"];
      if (!sig || !req.rawBody) {
        return res.status(401).json({ success: false, error: "Missing signature" });
      }
      const expected = crypto.createHmac("sha256", TRACKING_SECRET).update(req.rawBody).digest("hex");
      const sigBuf = Buffer.from(sig, "hex");
      const expectedBuf = Buffer.from(expected, "hex");
      if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
        return res.status(401).json({ success: false, error: "Invalid signature" });
      }
    }
```

- [ ] **Step 3: Verify server starts**

```bash
cd /c/Users/camst/woo-comprehensive-monitor/server && node -e "require('./src/app').createApp(); console.log('OK')"
```
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/tracking.js server/src/app.js
git commit -m "security: add HMAC signature verification for tracking endpoint"
```

---

### Task 3: Encrypt WooCommerce API Credentials at Rest

**Files:**
- Create: `server/src/services/crypto-service.js`
- Modify: `server/src/services/store-service.js`

Encrypt consumer_key and consumer_secret in the database using AES-256-GCM. The encryption key comes from `CREDENTIAL_KEY` env var. When not set, credentials are stored as-is (backward compatible). A migration function re-encrypts existing plaintext credentials on first boot.

- [ ] **Step 1: Create crypto-service.js**

```js
/**
 * Credential encryption — AES-256-GCM
 *
 * Encrypts WooCommerce consumer keys/secrets at rest in SQLite.
 * Format: iv:authTag:ciphertext (all hex)
 */

const crypto = require("crypto");

const ALGO = "aes-256-gcm";
const KEY_ENV = "CREDENTIAL_KEY"; // 64-char hex string (32 bytes)

// Cache derived key to avoid repeated Buffer.from on every encrypt/decrypt call
let _cachedKey = null;
let _cachedKeyEnv = null;

function getKey() {
  const hex = process.env[KEY_ENV];
  if (!hex) return null;
  if (hex.length !== 64) {
    console.error(`[Crypto] ${KEY_ENV} must be 64 hex chars (32 bytes). Encryption disabled.`);
    return null;
  }
  // Return cached key if env hasn't changed
  if (_cachedKey && _cachedKeyEnv === hex) return _cachedKey;
  _cachedKey = Buffer.from(hex, "hex");
  _cachedKeyEnv = hex;
  return _cachedKey;
}

function encrypt(plaintext) {
  const key = getKey();
  if (!key || !plaintext) return plaintext;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

function decrypt(stored) {
  const key = getKey();
  if (!key || !stored) return stored;

  // Not encrypted (no colons = plaintext from before encryption was enabled)
  if (!stored.includes(":")) return stored;

  const parts = stored.split(":");
  if (parts.length !== 3) return stored; // not our format

  const [ivHex, authTagHex, ciphertextHex] = parts;
  try {
    const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(ciphertextHex, "hex")), decipher.final()]);
    return decrypted.toString("utf8");
  } catch (err) {
    // Decryption failed — might be plaintext from before encryption
    console.error("[Crypto] Decryption failed, returning raw value:", err.message);
    return stored;
  }
}

function isEnabled() {
  return !!getKey();
}

module.exports = { encrypt, decrypt, isEnabled };
```

- [ ] **Step 2: Modify store-service.js to encrypt/decrypt credentials**

Add at top of `store-service.js`:

```js
const { encrypt, decrypt, isEnabled: cryptoEnabled } = require("./crypto-service");
```

Wrap `getAllStores()` to decrypt credentials on read:

Replace the existing `getAllStores` function body:

```js
function getAllStores() {
  const now = Date.now();
  if (_storeCache && now - _storeCacheTime < STORE_CACHE_TTL) {
    return _storeCache;
  }
  const rows = all("SELECT * FROM stores ORDER BY name");
  // Decrypt credentials if encryption is enabled
  _storeCache = rows.map(row => ({
    ...row,
    consumer_key: decrypt(row.consumer_key),
    consumer_secret: decrypt(row.consumer_secret),
  }));
  _storeCacheTime = now;
  return _storeCache;
}
```

In `upsertStore`, encrypt before writing. In the INSERT and UPDATE blocks, replace `consumerKey` and `consumerSecret` with `encrypt(consumerKey)` and `encrypt(consumerSecret)`:

In the UPDATE section, change:
```js
    if (consumerKey)        { fields.push("consumer_key = ?");        params.push(encrypt(consumerKey)); }
    if (consumerSecret)     { fields.push("consumer_secret = ?");     params.push(encrypt(consumerSecret)); }
```

In the INSERT section, change:
```js
      consumerKey ? encrypt(consumerKey) : null, consumerSecret ? encrypt(consumerSecret) : null,
```

In `updateStoreCredentials`, encrypt:
```js
function updateStoreCredentials(id, consumerKey, consumerSecret) {
  run(
    "UPDATE stores SET consumer_key = ?, consumer_secret = ?, updated_at = datetime('now') WHERE id = ?",
    [encrypt(consumerKey), encrypt(consumerSecret), id]
  );
  invalidateStoreCache();
}
```

Also wrap `getStore` to decrypt:
```js
function getStore(id) {
  const row = get("SELECT * FROM stores WHERE id = ?", [id]);
  if (!row) return null;
  return { ...row, consumer_key: decrypt(row.consumer_key), consumer_secret: decrypt(row.consumer_secret) };
}
```

- [ ] **Step 3: Add one-time migration to encrypt existing plaintext credentials**

In `index.js`, after `initDB()` and the sites.json migration, add:

```js
  // Encrypt existing plaintext credentials (one-time migration)
  const { isEnabled: cryptoEnabled, encrypt: encryptCred } = require("./services/crypto-service");
  if (cryptoEnabled()) {
    const allStoresRaw = require("./db").all("SELECT id, consumer_key, consumer_secret FROM stores");
    let migrated = 0;
    for (const s of allStoresRaw) {
      // Skip if already encrypted (contains colons) or null
      if (!s.consumer_key || s.consumer_key.includes(":")) continue;
      require("./db").run(
        "UPDATE stores SET consumer_key = ?, consumer_secret = ? WHERE id = ?",
        [encryptCred(s.consumer_key), encryptCred(s.consumer_secret), s.id]
      );
      migrated++;
    }
    if (migrated > 0) console.log(`[Crypto] Encrypted credentials for ${migrated} stores`);
  }
```

- [ ] **Step 4: Verify server starts**

```bash
cd /c/Users/camst/woo-comprehensive-monitor/server && node -e "require('./src/app').createApp(); console.log('OK')"
```
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add server/src/services/crypto-service.js server/src/services/store-service.js server/src/index.js
git commit -m "security: encrypt WooCommerce API credentials at rest (AES-256-GCM)"
```

---

### Task 4: Add TTL Cleanup to Alert/Email Dedup Caches

**Files:**
- Modify: `server/src/services/alert-service.js`

The `lastAlertTimes` object and `emailCooldowns` Map grow without bound. Add periodic cleanup.

- [ ] **Step 1: Add cache cleanup function to alert-service.js**

Add after `const EMAIL_COOLDOWN_MS = ...` line:

```js
// Periodic cache cleanup — evict expired entries every 30 minutes
function cleanupDedupCaches() {
  const now = Date.now();
  let alertEvicted = 0;
  let emailEvicted = 0;

  for (const key of Object.keys(lastAlertTimes)) {
    if (now - lastAlertTimes[key] > DEDUP_INTERVAL_MS) {
      delete lastAlertTimes[key];
      alertEvicted++;
    }
  }

  for (const [key, time] of emailCooldowns) {
    if (now - time > EMAIL_COOLDOWN_MS) {
      emailCooldowns.delete(key);
      emailEvicted++;
    }
  }

  if (alertEvicted + emailEvicted > 0) {
    console.log(`[Cache] Cleaned dedup caches: ${alertEvicted} alert keys, ${emailEvicted} email keys`);
  }
}

// Run cleanup every 30 minutes
setInterval(cleanupDedupCaches, 30 * 60 * 1000).unref();
```

The `.unref()` ensures the interval doesn't prevent Node.js from exiting.

- [ ] **Step 2: Verify server starts**

```bash
cd /c/Users/camst/woo-comprehensive-monitor/server && node -e "require('./src/services/alert-service'); console.log('OK')"
```
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add server/src/services/alert-service.js
git commit -m "perf: add TTL cleanup to alert/email dedup caches"
```

---

### Task 5: Fix Dashboard N+1 Query (25 DB calls → 1)

**Files:**
- Modify: `server/src/routes/dashboard.js`

Currently `getStoreStats()` is called per-store (25 separate queries). Batch it.

- [ ] **Step 1: Replace N+1 with batch query in dashboard.js**

Replace the entire `router.get("/dashboard", ...)` handler:

```js
router.get("/dashboard", (req, res) => {
  const stores = storeService.getAllStores();
  const { alerts: recentAlerts, total: totalAlerts } = alertService.getAlerts({ limit: 100 });
  const stats = alertService.getAlertStats();

  // Batch query all store_stats in one go instead of N+1
  const allStats = all("SELECT * FROM store_stats");
  const statsMap = {};
  for (const row of allStats) {
    statsMap[row.store_id] = {
      ...row,
      features: JSON.parse(row.features || "{}"),
      admin_notices: JSON.parse(row.admin_notices || "[]"),
      error_counts: JSON.parse(row.error_counts || "{}"),
    };
  }

  const enhancedStores = stores.map(store => {
    const storeStats = statsMap[store.id] || null;
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
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().split("T")[0];

  const trendRows = all(
    `SELECT date(timestamp) as date,
            COUNT(*) as total,
            SUM(CASE WHEN severity='critical' THEN 1 ELSE 0 END) as critical,
            SUM(CASE WHEN severity='high'     THEN 1 ELSE 0 END) as high,
            SUM(CASE WHEN severity='medium'   THEN 1 ELSE 0 END) as medium
     FROM alerts
     WHERE date(timestamp) >= ?
     GROUP BY date(timestamp)
     ORDER BY date(timestamp) ASC`,
    [sevenDaysAgoStr]
  );

  const trendMap = {};
  trendRows.forEach(r => { trendMap[r.date] = r; });

  const alertTrends = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    const r = trendMap[dateStr] || { total: 0, critical: 0, high: 0, medium: 0 };
    alertTrends.push({ date: dateStr, total: r.total, critical: r.critical, high: r.high, medium: r.medium });
  }

  res.json({
    status: "ok",
    version: "3.1.0",
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
```

- [ ] **Step 2: Verify server starts**

```bash
cd /c/Users/camst/woo-comprehensive-monitor/server && node -e "require('./src/app').createApp(); console.log('OK')"
```
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add server/src/routes/dashboard.js
git commit -m "perf: batch store_stats query on dashboard (N+1 → 1)"
```

---

### Task 6: Stagger Cron Schedules to Prevent CPU Spike Collisions

**Files:**
- Modify: `server/src/index.js`

Currently revenue sync (`*/30`) and inventory sync (`*/30`) fire at the same minute. Health checks (`*/15`) also collide at :00 and :30. Stagger them.

- [ ] **Step 1: Update cron schedules in index.js**

Change these schedules:

| Task | Old | New | Rationale |
|------|-----|-----|-----------|
| Health checks | `*/15 * * * *` | `5,20,35,50 * * * *` | Offset by 5min from :00, avoids uptime at :02,:07... |
| Revenue sync | `*/30 * * * *` | `15,45 * * * *` | Every 30min but offset to :15/:45 |
| Inventory sync | `*/30 * * * *` | `25,55 * * * *` | Every 30min offset to :25/:55 |
| WP-Cron trigger | `*/15 * * * *` | `10,40 * * * *` | Every 30min offset from everything |
| Silent stores | `0 * * * *` | `0 * * * *` | No change — lightweight, no collision risk |

Replace in `index.js`:

Health check schedule:
```js
  cron.schedule("5,20,35,50 * * * *", async () => {
```

Revenue sync schedule:
```js
  cron.schedule("15,45 * * * *", () => {
```

Inventory sync schedule:
```js
  cron.schedule("25,55 * * * *", () => {
```

WP-Cron trigger schedule:
```js
  cron.schedule("10,40 * * * *", async () => {
```

- [ ] **Step 2: Add guard for inventory sync (currently missing)**

The inventory sync lacks the same `_syncRunning` guard as revenue. It has one inside the service but add logging in index.js for clarity:

Already handled in `inventory-service.js` — no change needed, just verify.

- [ ] **Step 3: Verify server starts**

```bash
cd /c/Users/camst/woo-comprehensive-monitor/server && node -e "require('./src/app').createApp(); console.log('OK')"
```
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add server/src/index.js
git commit -m "perf: stagger cron schedules to prevent CPU spike collisions"
```

---

### Task 7: Add Dashboard Response Caching

**Files:**
- Modify: `server/src/routes/dashboard.js`

The dashboard endpoint is hit on every page load and auto-refresh. Cache the response for 30 seconds.

- [ ] **Step 1: Add response cache to dashboard.js**

Add at the top of `dashboard.js`, after the requires:

```js
// Cache dashboard response for 30s — prevents DB hammering on auto-refresh
let _dashCache = null;
let _dashCacheTime = 0;
const DASH_CACHE_TTL = 30 * 1000;
```

Then at the very start of the handler, before any DB calls:

```js
router.get("/dashboard", (req, res) => {
  const now = Date.now();
  if (_dashCache && now - _dashCacheTime < DASH_CACHE_TTL) {
    return res.json(_dashCache);
  }

  // ... existing code ...
```

And at the end, before `res.json(...)`, cache the response:

```js
  const response = {
    status: "ok",
    version: "3.1.0",
    // ... rest of the response object
  };

  _dashCache = response;
  _dashCacheTime = Date.now();
  res.json(response);
```

- [ ] **Step 2: Commit**

```bash
git add server/src/routes/dashboard.js
git commit -m "perf: cache dashboard response for 30s"
```

---

### Task 8: Add Cron Telemetry Logging

**Files:**
- Create: `server/src/services/cron-telemetry.js`
- Modify: `server/src/index.js`

Add timing and duration logging to all cron tasks so you can see which ones run long.

- [ ] **Step 1: Create cron-telemetry.js**

```js
/**
 * Cron Telemetry — tracks execution time and warns on slow runs
 */

const _cronStats = {};

async function timedCron(name, fn) {
  const start = Date.now();
  let hadError = false;
  try {
    await fn();
  } catch (err) {
    hadError = true;
    console.error(`[Cron:${name}] Error: ${err.message}`);
  }
  const duration = Date.now() - start;

  if (!_cronStats[name]) {
    _cronStats[name] = { runs: 0, totalMs: 0, maxMs: 0, lastMs: 0, errors: 0 };
  }
  const s = _cronStats[name];
  s.runs++;
  if (hadError) s.errors++;
  s.totalMs += duration;
  s.lastMs = duration;
  if (duration > s.maxMs) s.maxMs = duration;
  s.lastRun = new Date().toISOString();

  if (duration > 60000) {
    console.warn(`[Cron:${name}] SLOW: took ${(duration / 1000).toFixed(1)}s`);
  } else {
    console.log(`[Cron:${name}] Done in ${(duration / 1000).toFixed(1)}s`);
  }
}

function getCronStats() {
  return Object.entries(_cronStats).map(([name, s]) => ({
    name,
    runs: s.runs,
    avgMs: Math.round(s.totalMs / s.runs),
    maxMs: s.maxMs,
    lastMs: s.lastMs,
    lastRun: s.lastRun,
  }));
}

module.exports = { timedCron, getCronStats };
```

- [ ] **Step 2: Wrap all cron tasks in index.js with timedCron**

Add require at top:

```js
const { timedCron } = require("./services/cron-telemetry");
```

Replace each cron callback. Example for health check:

```js
  cron.schedule("5,20,35,50 * * * *", async () => {
    if (_healthRunning) { console.log("[Health] Skipping — previous run still active"); return; }
    _healthRunning = true;
    try { await timedCron("health", () => checkAllStores()); } finally { _healthRunning = false; }
  });
```

Revenue sync:
```js
  cron.schedule("15,45 * * * *", () => {
    timedCron("revenue", () => syncRevenue());
  });
```

Uptime:
```js
  cron.schedule("2,7,12,17,22,27,32,37,42,47,52,57 * * * *", () => {
    timedCron("uptime", () => checkUptime());
  });
```

Inventory:
```js
  cron.schedule("25,55 * * * *", () => {
    timedCron("inventory", () => syncInventory());
  });
```

WP-Cron trigger:
```js
  cron.schedule("10,40 * * * *", () => {
    timedCron("wp-cron", async () => {
      const stores = require("./services/store-service").getAllStores();
      const axios = require("axios");
      for (const store of stores) {
        try {
          await axios.get(`${store.url}/wp-cron.php?doing_wp_cron`, { timeout: 10000 });
        } catch (_) {}
        await new Promise(r => setTimeout(r, 2000));
      }
      console.log(`[WP-Cron] Triggered ${stores.length} sites`);
    });
  });
```

- [ ] **Step 3: Expose cron stats on /api/system endpoint**

In `server/src/routes/system.js`, add cron stats to the `/system/config` response. Add require at the top:

```js
const { getCronStats } = require("../services/cron-telemetry");
```

In the `router.get("/system/config", ...)` handler, add to the response object:

```js
    cronStats: getCronStats(),
```

- [ ] **Step 4: Verify server starts**

```bash
cd /c/Users/camst/woo-comprehensive-monitor/server && node -e "require('./src/app').createApp(); console.log('OK')"
```
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add server/src/services/cron-telemetry.js server/src/index.js server/src/routes/system.js
git commit -m "ops: add cron telemetry logging with duration tracking"
```

---

### Task 9: Fix Uptime Summary N+1 Queries

**Files:**
- Modify: `server/src/services/uptime-service.js`

`getUptimeSummary()` runs 3 separate queries per store (75 total for 25 stores). Batch them.

- [ ] **Step 1: Add composite index for the batch query**

In `server/src/db.js`, after migrations run (after the migration loop), add:

```js
  // Performance index for uptime batch queries
  _db.exec("CREATE INDEX IF NOT EXISTS idx_uptime_store_checked ON uptime_checks(store_id, checked_at)");
```

- [ ] **Step 2: Replace N+1 with batch queries in getUptimeSummary**

Replace the `getUptimeSummary` function:

```js
function getUptimeSummary() {
  const stores = storeService.getAllStores();

  // Batch: latest check per store
  const latestChecks = all(
    `SELECT u.* FROM uptime_checks u
     INNER JOIN (
       SELECT store_id, MAX(checked_at) as max_checked
       FROM uptime_checks GROUP BY store_id
     ) latest ON u.store_id = latest.store_id AND u.checked_at = latest.max_checked`
  );
  const latestMap = {};
  for (const c of latestChecks) latestMap[c.store_id] = c;

  // Batch: 24h uptime counts per store
  const uptimeCounts = all(
    `SELECT store_id,
            COUNT(*) as total,
            SUM(CASE WHEN status_code >= 200 AND status_code < 400 THEN 1 ELSE 0 END) as up
     FROM uptime_checks
     WHERE checked_at >= datetime('now', '-24 hours')
     GROUP BY store_id`
  );
  const uptimeMap = {};
  for (const c of uptimeCounts) uptimeMap[c.store_id] = c;

  const summary = stores.map(store => {
    const latest = latestMap[store.id];
    const counts = uptimeMap[store.id] || { total: 0, up: 0 };

    return {
      store_id: store.id,
      store_name: store.name,
      store_url: store.url,
      status_code: latest?.status_code || null,
      response_time_ms: latest?.response_time_ms || null,
      ssl_expiry_date: latest?.ssl_expiry_date || null,
      ssl_days_remaining: latest?.ssl_days_remaining || null,
      uptime_24h: counts.total > 0 ? parseFloat(((counts.up / counts.total) * 100).toFixed(1)) : null,
      last_checked: latest?.checked_at || null,
    };
  });

  const up = summary.filter(s => s.status_code && s.status_code >= 200 && s.status_code < 400).length;
  const down = summary.filter(s => s.status_code === 0 || (s.status_code && s.status_code >= 500)).length;
  const avgResponse = summary.filter(s => s.response_time_ms).reduce((sum, s) => sum + s.response_time_ms, 0) / (summary.filter(s => s.response_time_ms).length || 1);
  const sslWarnings = summary.filter(s => s.ssl_days_remaining !== null && s.ssl_days_remaining < 30).length;

  return { up, down, unknown: summary.length - up - down, avgResponse: Math.round(avgResponse), sslWarnings, stores: summary };
}
```

- [ ] **Step 3: Verify server starts**

```bash
cd /c/Users/camst/woo-comprehensive-monitor/server && node -e "require('./src/app').createApp(); console.log('OK')"
```
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add server/src/services/uptime-service.js server/src/db.js
git commit -m "perf: batch uptime summary queries (75 → 2) with composite index"
```

---

### Task 10: Harden Auth — Remove GET Bypass from API Key Middleware

**Files:**
- Modify: `server/src/middleware/auth.js`

The `apiKeyMiddleware` currently allows ALL GET requests without auth. This means any unauthenticated request can read store data, revenue, disputes, etc. Fix it so GET requests still require auth (the `authMiddleware` handles this, but `apiKeyMiddleware` short-circuits first).

- [ ] **Step 1: Remove GET bypass in apiKeyMiddleware**

Replace the `apiKeyMiddleware` function:

```js
function apiKeyMiddleware(req, res, next) {
  // Plugin endpoints skip API key check (path relative to /api mount)
  if (req.path === "/track-woo-error") return next();

  // Public endpoints that don't need any auth
  const publicPaths = ["/health", "/auth/request-code", "/auth/verify-code"];
  if (publicPaths.includes(req.path)) return next();
  if (req.path.startsWith("/portal/")) return next();

  // Dashboard auth token (covers both GET and POST)
  const authToken = req.headers["x-auth-token"] || req.query?.authToken;
  if (authToken && validateToken(authToken)) return next();

  // API key (covers both GET and POST)
  const apiKey = req.headers["x-api-key"] || req.query?.apiKey;
  const validApiKey = process.env.API_KEY;
  if (validApiKey && apiKey === validApiKey) return next();

  // If no API_KEY is configured, allow (backward compat for setups without API key)
  if (!validApiKey) return next();

  return res.status(401).json({ error: "Invalid or missing API key" });
}
```

- [ ] **Step 2: Verify server starts**

```bash
cd /c/Users/camst/woo-comprehensive-monitor/server && node -e "require('./src/app').createApp(); console.log('OK')"
```
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add server/src/middleware/auth.js
git commit -m "security: remove GET bypass in apiKeyMiddleware — all API requests require auth"
```

---

## Summary

| Task | Category | Impact |
|------|----------|--------|
| 1. Helmet.js | Security | HTTP security headers (XSS, clickjacking, MIME sniffing) |
| 2. HMAC tracking | Security | Prevent fake events on tracking endpoint |
| 3. Credential encryption | Security | AES-256-GCM for API keys at rest |
| 4. Cache TTL cleanup | Performance | Prevent unbounded memory growth |
| 5. Dashboard N+1 fix | Performance | 25 DB queries → 1 |
| 6. Cron staggering | Performance | Prevent CPU spike collisions |
| 7. Dashboard caching | Performance | 30s response cache |
| 8. Cron telemetry | Observability | Track and warn on slow cron jobs |
| 9. Uptime N+1 fix | Performance | 75 DB queries → 2 |
| 10. Auth hardening | Security | Close GET bypass, require auth on all endpoints |
