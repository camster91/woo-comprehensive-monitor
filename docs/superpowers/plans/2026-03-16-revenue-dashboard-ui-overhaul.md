# Revenue Dashboard + UI Overhaul Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add server-side revenue polling from WooCommerce REST API, a new Revenue dashboard page with charts, and overhaul the entire UI from top-nav to sidebar layout with indigo/violet SaaS theme.

**Architecture:** Server-side cron polls WC REST API across 33 stores, aggregates daily revenue/order data into SQLite `revenue_snapshots` table. New React page renders the data with Chart.js. All dashboard pages get restyled with a new sidebar nav and consistent indigo/violet theme.

**Tech Stack:** Node.js/Express 5, better-sqlite3, @woocommerce/woocommerce-rest-api, p-limit v3, node-cron, React 19, Tailwind 4, Chart.js/react-chartjs-2, Lucide React, Vite 7.

**Spec:** `docs/superpowers/specs/2026-03-16-revenue-dashboard-ui-overhaul-design.md`

---

## Chunk 1: Revenue Data Backend

### Task 1: Database Migration

**Files:**
- Create: `server/migrations/004_revenue_snapshots.sql`
- Modify: `server/src/db.js:57-59` (add migration 004 to versionedMigrations array)

- [ ] **Step 1: Create migration SQL file**

```sql
-- server/migrations/004_revenue_snapshots.sql

CREATE TABLE IF NOT EXISTS revenue_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id TEXT,
  date TEXT NOT NULL,
  total_revenue REAL DEFAULT 0,
  order_count INTEGER DEFAULT 0,
  orders_processing INTEGER DEFAULT 0,
  orders_completed INTEGER DEFAULT 0,
  orders_refunded INTEGER DEFAULT 0,
  orders_failed INTEGER DEFAULT 0,
  orders_pending INTEGER DEFAULT 0,
  refund_total REAL DEFAULT 0,
  abandoned_carts INTEGER DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  synced_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_revenue_store_date ON revenue_snapshots(store_id, date);
CREATE INDEX IF NOT EXISTS idx_revenue_date ON revenue_snapshots(date);
```

- [ ] **Step 2: Register migration in db.js**

In `server/src/db.js`, add to the `versionedMigrations` array (after the `003` entry):

```javascript
{ version: "004", file: "004_revenue_snapshots.sql" },
```

- [ ] **Step 3: Verify migration runs**

Run: `cd server && node -e "require('./src/db').initDB(); console.log('OK')"`
Expected: `[DB] Migration 004 applied` then `OK`

- [ ] **Step 4: Commit**

```bash
git add server/migrations/004_revenue_snapshots.sql server/src/db.js
git commit -m "feat: add revenue_snapshots table (migration 004)"
```

---

### Task 2: Revenue Service

**Files:**
- Create: `server/src/services/revenue-service.js`

- [ ] **Step 1: Create revenue-service.js**

```javascript
// server/src/services/revenue-service.js

const WooCommerceRestApi = require("@woocommerce/woocommerce-rest-api").default;
const pLimit = require("p-limit");
const { run, get, all } = require("../db");
const storeService = require("./store-service");

let _syncRunning = false;

/**
 * Fetch orders from a single store's WC REST API for a date range,
 * aggregate by day, and upsert into revenue_snapshots.
 */
async function syncStoreRevenue(store, afterDate, beforeDate) {
  if (!store.consumer_key || !store.consumer_secret) return null;

  const api = new WooCommerceRestApi({
    url: store.url,
    consumerKey: store.consumer_key,
    consumerSecret: store.consumer_secret,
    version: "wc/v3",
    timeout: 30000,
  });

  // Fetch all orders in date range, paginating
  let page = 1;
  let allOrders = [];
  while (true) {
    try {
      const { data } = await api.get("orders", {
        after: afterDate + "T00:00:00",
        before: beforeDate + "T23:59:59",
        per_page: 100,
        page,
        orderby: "date",
        order: "asc",
      });
      if (!data || data.length === 0) break;
      allOrders = allOrders.concat(data);
      if (data.length < 100) break;
      page++;
    } catch (err) {
      // If pagination fails partway, use what we have
      console.error(`[Revenue] Page ${page} failed for ${store.name}: ${err.message}`);
      break;
    }
  }

  // Group orders by date
  const byDate = {};
  for (const order of allOrders) {
    const date = order.date_created.split("T")[0]; // YYYY-MM-DD
    if (!byDate[date]) {
      byDate[date] = {
        total_revenue: 0,
        order_count: 0,
        orders_processing: 0,
        orders_completed: 0,
        orders_refunded: 0,
        orders_failed: 0,
        orders_pending: 0,
        refund_total: 0,
      };
    }
    const d = byDate[date];
    d.order_count++;
    const total = parseFloat(order.total) || 0;

    switch (order.status) {
      case "processing": d.orders_processing++; d.total_revenue += total; break;
      case "completed":  d.orders_completed++;  d.total_revenue += total; break;
      case "refunded":   d.orders_refunded++;   d.refund_total += total;  break;
      case "failed":     d.orders_failed++;     break;
      case "pending":
      case "on-hold":    d.orders_pending++;    break;
      default:           break;
    }
  }

  // Upsert each day into revenue_snapshots
  for (const [date, d] of Object.entries(byDate)) {
    run(
      `INSERT OR REPLACE INTO revenue_snapshots
        (store_id, date, total_revenue, order_count, orders_processing, orders_completed,
         orders_refunded, orders_failed, orders_pending, refund_total, currency, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'USD', datetime('now'))`,
      [store.id, date, d.total_revenue, d.order_count, d.orders_processing, d.orders_completed,
       d.orders_refunded, d.orders_failed, d.orders_pending, d.refund_total]
    );
  }

  return { store: store.name, days: Object.keys(byDate).length, orders: allOrders.length };
}

/**
 * Sync revenue data for all stores with API credentials.
 * Uses mutex guard to prevent concurrent syncs.
 */
async function syncAllStores(options = {}) {
  if (_syncRunning) {
    console.log("[Revenue] Sync already running, skipping");
    return { skipped: true };
  }
  _syncRunning = true;

  try {
    const stores = storeService.getAllStores().filter(s => s.consumer_key && s.consumer_secret);
    const concurrency = options.concurrency || 3;
    const limit = pLimit(concurrency);

    // Determine date range: check what we already have
    const hasData = get("SELECT COUNT(*) as c FROM revenue_snapshots");
    let afterDate, beforeDate;
    const today = new Date().toISOString().split("T")[0];

    if (!hasData || hasData.c === 0) {
      // First sync: last 7 days (progressive backfill extends in subsequent syncs)
      const d = new Date();
      d.setDate(d.getDate() - 7);
      afterDate = d.toISOString().split("T")[0];
      beforeDate = today;
    } else {
      // Regular sync: last 2 days (catch late-arriving orders)
      const d = new Date();
      d.setDate(d.getDate() - 2);
      afterDate = d.toISOString().split("T")[0];
      beforeDate = today;
    }

    console.log(`[Revenue] Syncing ${stores.length} stores from ${afterDate} to ${beforeDate}`);
    const results = [];
    const errors = [];

    await Promise.all(stores.map(store => limit(async () => {
      try {
        const result = await syncStoreRevenue(store, afterDate, beforeDate);
        if (result) results.push(result);
      } catch (err) {
        console.error(`[Revenue] Failed: ${store.name}: ${err.message}`);
        errors.push({ store: store.name, error: err.message });
      }
    })));

    console.log(`[Revenue] Done. ${results.length} synced, ${errors.length} failed`);

    // Check if backfill needs to extend
    if (hasData && hasData.c > 0) {
      const oldest = get("SELECT MIN(date) as d FROM revenue_snapshots");
      if (oldest && oldest.d) {
        const oldestDate = new Date(oldest.d);
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        if (oldestDate > ninetyDaysAgo) {
          // Schedule a background backfill extension (next sync will pick it up)
          const extendTo = new Date(oldestDate);
          extendTo.setDate(extendTo.getDate() - 30);
          const extendDate = extendTo < ninetyDaysAgo ? ninetyDaysAgo.toISOString().split("T")[0] : extendTo.toISOString().split("T")[0];
          console.log(`[Revenue] Backfill: extending from ${oldest.d} back to ${extendDate}`);
          const backfillLimit = pLimit(1); // Lower concurrency for backfill
          await Promise.all(stores.map(store => backfillLimit(async () => {
            try {
              await syncStoreRevenue(store, extendDate, oldest.d);
            } catch (err) {
              console.error(`[Revenue] Backfill failed: ${store.name}: ${err.message}`);
            }
          })));
        }
      }
    }

    return { synced: results.length, failed: errors.length, errors, results };
  } finally {
    _syncRunning = false;
  }
}

// ── Query functions ──

/**
 * Get revenue summary for a period.
 * @param {string} period - "today", "7d", "30d", "90d"
 * @param {string} [storeId] - Optional store filter
 */
function getRevenueSummary(period, storeId) {
  const { startDate, prevStartDate, prevEndDate } = periodToDates(period);
  const today = new Date().toISOString().split("T")[0];

  const params = [startDate, today];
  const prevParams = [prevStartDate, prevEndDate];
  let storeFilter = "";
  if (storeId) {
    storeFilter = " AND store_id = ?";
    params.push(storeId);
    prevParams.push(storeId);
  }

  const current = get(
    `SELECT
      COALESCE(SUM(total_revenue), 0) as totalRevenue,
      COALESCE(SUM(order_count), 0) as totalOrders,
      COALESCE(SUM(orders_processing), 0) as processingCount,
      COALESCE(SUM(orders_completed), 0) as completedCount,
      COALESCE(SUM(orders_refunded), 0) as refundedCount,
      COALESCE(SUM(orders_failed), 0) as failedCount,
      COALESCE(SUM(orders_pending), 0) as pendingCount,
      COALESCE(SUM(abandoned_carts), 0) as abandonedCarts,
      COALESCE(SUM(refund_total), 0) as refundTotal
     FROM revenue_snapshots
     WHERE date >= ? AND date <= ?${storeFilter}`,
    params
  );

  const previous = get(
    `SELECT
      COALESCE(SUM(total_revenue), 0) as totalRevenue,
      COALESCE(SUM(order_count), 0) as totalOrders
     FROM revenue_snapshots
     WHERE date >= ? AND date <= ?${storeFilter}`,
    prevParams
  );

  const revenueChange = previous.totalRevenue > 0
    ? ((current.totalRevenue - previous.totalRevenue) / previous.totalRevenue * 100).toFixed(1)
    : null;
  const ordersChange = previous.totalOrders > 0
    ? ((current.totalOrders - previous.totalOrders) / previous.totalOrders * 100).toFixed(1)
    : null;

  return {
    ...current,
    revenueChange: revenueChange ? parseFloat(revenueChange) : null,
    ordersChange: ordersChange ? parseFloat(ordersChange) : null,
    period,
  };
}

/**
 * Get daily revenue timeline for charting.
 */
function getRevenueTimeline(days, storeId) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - (days - 1));
  const startStr = startDate.toISOString().split("T")[0];
  const today = new Date().toISOString().split("T")[0];

  const params = [startStr, today];
  let storeFilter = "";
  if (storeId) {
    storeFilter = " AND store_id = ?";
    params.push(storeId);
  }

  const rows = all(
    `SELECT date,
      SUM(total_revenue) as revenue,
      SUM(order_count) as orders,
      SUM(orders_failed) as failed
     FROM revenue_snapshots
     WHERE date >= ? AND date <= ?${storeFilter}
     GROUP BY date
     ORDER BY date ASC`,
    params
  );

  // Fill gaps with zeros
  const rowMap = {};
  rows.forEach(r => { rowMap[r.date] = r; });

  const timeline = [];
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    const dateStr = d.toISOString().split("T")[0];
    const r = rowMap[dateStr];
    timeline.push({
      date: dateStr,
      revenue: r ? r.revenue : 0,
      orders: r ? r.orders : 0,
      failed: r ? r.failed : 0,
    });
  }

  return timeline;
}

/**
 * Get per-store revenue breakdown.
 */
function getRevenueByStore(period) {
  const { startDate } = periodToDates(period);
  const today = new Date().toISOString().split("T")[0];

  return all(
    `SELECT
      rs.store_id,
      s.name as store_name,
      SUM(rs.total_revenue) as revenue,
      SUM(rs.order_count) as orders,
      SUM(rs.orders_failed) as failed,
      CASE WHEN SUM(rs.order_count) > 0
        THEN ROUND(SUM(rs.total_revenue) / SUM(rs.order_count), 2)
        ELSE 0 END as avg_order_value
     FROM revenue_snapshots rs
     LEFT JOIN stores s ON rs.store_id = s.id
     WHERE rs.date >= ? AND rs.date <= ?
     GROUP BY rs.store_id
     ORDER BY revenue DESC`,
    [startDate, today]
  );
}

/**
 * Get failed payment counts by day.
 */
function getFailedPayments(days, storeId) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - (days - 1));
  const startStr = startDate.toISOString().split("T")[0];
  const today = new Date().toISOString().split("T")[0];

  const params = [startStr, today];
  let storeFilter = "";
  if (storeId) {
    storeFilter = " AND store_id = ?";
    params.push(storeId);
  }

  return all(
    `SELECT date,
      SUM(orders_failed) as failed,
      SUM(orders_pending) as pending
     FROM revenue_snapshots
     WHERE date >= ? AND date <= ?${storeFilter}
     GROUP BY date
     ORDER BY date ASC`,
    params
  );
}

// ── Helpers ──

function periodToDates(period) {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  let days;

  switch (period) {
    case "today": days = 1; break;
    case "7d":    days = 7; break;
    case "30d":   days = 30; break;
    case "90d":   days = 90; break;
    default:      days = 7;
  }

  const start = new Date();
  start.setDate(start.getDate() - (days - 1));
  const startDate = start.toISOString().split("T")[0];

  // Previous period for comparison
  const prevEnd = new Date(start);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - (days - 1));

  return {
    startDate,
    endDate: todayStr,
    prevStartDate: prevStart.toISOString().split("T")[0],
    prevEndDate: prevEnd.toISOString().split("T")[0],
  };
}

module.exports = {
  syncStoreRevenue,
  syncAllStores,
  getRevenueSummary,
  getRevenueTimeline,
  getRevenueByStore,
  getFailedPayments,
};
```

- [ ] **Step 2: Verify service loads without errors**

Run: `cd server && node -e "require('./src/db').initDB(); const rs = require('./src/services/revenue-service'); console.log(Object.keys(rs))"`
Expected: Array of exported function names, no errors.

- [ ] **Step 3: Commit**

```bash
git add server/src/services/revenue-service.js
git commit -m "feat: add revenue-service with WC API polling and query functions"
```

---

### Task 3: Revenue API Routes

**Files:**
- Create: `server/src/routes/revenue.js`
- Modify: `server/src/app.js:107` (mount revenue routes)

- [ ] **Step 1: Create revenue routes**

```javascript
// server/src/routes/revenue.js

const { Router } = require("express");
const revenueService = require("../services/revenue-service");

const router = Router();

// GET /api/revenue?period=7d&store=<id>
router.get("/revenue", (req, res) => {
  const period = req.query.period || "7d";
  const storeId = req.query.store || null;
  const summary = revenueService.getRevenueSummary(period, storeId);
  res.json({ status: "ok", ...summary });
});

// GET /api/revenue/timeline?days=7&store=<id>
router.get("/revenue/timeline", (req, res) => {
  const days = parseInt(req.query.days) || 7;
  const storeId = req.query.store || null;
  const timeline = revenueService.getRevenueTimeline(Math.min(days, 365), storeId);
  res.json({ status: "ok", timeline });
});

// GET /api/revenue/stores?period=7d
router.get("/revenue/stores", (req, res) => {
  const period = req.query.period || "7d";
  const stores = revenueService.getRevenueByStore(period);
  res.json({ status: "ok", stores });
});

// GET /api/revenue/failed?days=7&store=<id>
router.get("/revenue/failed", (req, res) => {
  const days = parseInt(req.query.days) || 7;
  const storeId = req.query.store || null;
  const data = revenueService.getFailedPayments(Math.min(days, 365), storeId);
  res.json({ status: "ok", data });
});

// POST /api/revenue/sync — manual trigger
router.post("/revenue/sync", async (req, res) => {
  try {
    const result = await revenueService.syncAllStores();
    if (result.skipped) {
      return res.json({ status: "ok", message: "Sync already in progress" });
    }
    res.json({ status: "ok", ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
```

- [ ] **Step 2: Mount routes in app.js**

In `server/src/app.js`, add after the `system` route (line ~108):

```javascript
app.use("/api", require("./routes/revenue"));
```

- [ ] **Step 3: Commit**

```bash
git add server/src/routes/revenue.js server/src/app.js
git commit -m "feat: add revenue API routes (summary, timeline, stores, failed, sync)"
```

---

### Task 4: Register Revenue Sync Cron

**Files:**
- Modify: `server/src/index.js:60` (add cron job)
- Modify: `server/src/routes/tracking.js:8-23` (add cart_abandonment_stats type)

- [ ] **Step 1: Add revenue sync cron to index.js**

In `server/src/index.js`, add after the silent-store cron (after line 57):

```javascript
// Revenue sync every 30 minutes
const { syncAllStores: syncRevenue } = require("./services/revenue-service");
cron.schedule("*/30 * * * *", () => {
  syncRevenue().catch(e => console.error("[Revenue]", e.message));
});
```

Also add an initial delayed sync after server starts (inside the `app.listen` callback, after the health check setTimeout around line 105):

```javascript
// Initial revenue sync 60s after boot
setTimeout(() => syncRevenue().catch(e => console.error("[Revenue]", e.message)), 60 * 1000);
```

- [ ] **Step 2: Add cart_abandonment_stats to tracking.js VALID_TYPES**

In `server/src/routes/tracking.js`, add to the VALID_TYPES Set:

```javascript
"cart_abandonment_stats",
```

And add a handler block before the regular frontend errors section (before line ~251):

```javascript
// --- Cart abandonment stats ---
if (type === "cart_abandonment_stats") {
  const count = parseInt(req.body.abandoned_count) || 0;
  const date = new Date().toISOString().split("T")[0];
  if (storeId && count >= 0) {
    run(
      `UPDATE revenue_snapshots SET abandoned_carts = ? WHERE store_id = ? AND date = ?`,
      [count, storeId, date]
    );
  }
  return res.json({ success: true });
}
```

Add `run` to the require from `../db` at the top of tracking.js (if not already imported).

- [ ] **Step 3: Commit**

```bash
git add server/src/index.js server/src/routes/tracking.js
git commit -m "feat: register revenue sync cron + cart abandonment tracking type"
```

---

## Chunk 2: UI Overhaul — Shared Components + Sidebar Layout

### Task 5: Shared Components (StatCard, PageHeader, TimeRangeSelector, DataTable)

**Files:**
- Create: `server/dashboard/src/components/StatCard.jsx`
- Create: `server/dashboard/src/components/PageHeader.jsx`
- Create: `server/dashboard/src/components/TimeRangeSelector.jsx`
- Create: `server/dashboard/src/components/DataTable.jsx`

- [ ] **Step 1: Create StatCard.jsx**

```jsx
// server/dashboard/src/components/StatCard.jsx

import { TrendingUp, TrendingDown } from "lucide-react";

export default function StatCard({ label, value, icon, sub, change, variant = "default", pulse }) {
  if (variant === "hero") {
    return (
      <div className="bg-gradient-to-br from-indigo-500 to-violet-500 rounded-xl p-5 text-white relative overflow-hidden">
        {pulse && (
          <span className="absolute top-3 right-3 flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
          </span>
        )}
        {icon && <div className="inline-flex p-2 rounded-lg bg-white/20 mb-3">{icon}</div>}
        <p className="text-3xl font-bold">{value ?? "\u2014"}</p>
        <p className="text-sm text-white/70 mt-1">{label}{sub ? ` \u00b7 ${sub}` : ""}</p>
        {change != null && (
          <div className={`flex items-center gap-1 mt-2 text-xs ${change >= 0 ? "text-emerald-200" : "text-red-200"}`}>
            {change >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            <span>{change >= 0 ? "+" : ""}{change}%</span>
            <span className="text-white/50">vs prev</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 relative overflow-hidden">
      {pulse && (
        <span className="absolute top-3 right-3 flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
        </span>
      )}
      {icon && <div className="inline-flex p-2 rounded-lg bg-slate-50 text-slate-500 mb-3">{icon}</div>}
      <p className="text-3xl font-bold text-slate-900">{value ?? "\u2014"}</p>
      <p className="text-xs text-slate-400 mt-1">{label}{sub ? ` \u00b7 ${sub}` : ""}</p>
      {change != null && (
        <div className={`flex items-center gap-1 mt-2 text-xs ${change >= 0 ? "text-emerald-500" : "text-red-500"}`}>
          {change >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          <span>{change >= 0 ? "+" : ""}{change}%</span>
          <span className="text-slate-400">vs prev</span>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create PageHeader.jsx**

```jsx
// server/dashboard/src/components/PageHeader.jsx

export default function PageHeader({ title, subtitle, children }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="text-sm text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}
```

- [ ] **Step 3: Create TimeRangeSelector.jsx**

```jsx
// server/dashboard/src/components/TimeRangeSelector.jsx

const DEFAULT_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
];

export default function TimeRangeSelector({ value, onChange, options = DEFAULT_OPTIONS }) {
  return (
    <div className="flex gap-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            value === opt.value
              ? "bg-indigo-50 text-indigo-600"
              : "bg-gray-100 text-gray-500 hover:bg-gray-200"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Create DataTable.jsx**

```jsx
// server/dashboard/src/components/DataTable.jsx

import { useState } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";

export default function DataTable({ columns, data, onRowClick }) {
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("desc");

  function handleSort(key) {
    if (!key) return;
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const sorted = sortKey
    ? [...data].sort((a, b) => {
        const aVal = a[sortKey] ?? 0;
        const bVal = b[sortKey] ?? 0;
        const cmp = typeof aVal === "string" ? aVal.localeCompare(bVal) : aVal - bVal;
        return sortDir === "asc" ? cmp : -cmp;
      })
    : data;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            {columns.map((col) => (
              <th
                key={col.key}
                onClick={() => col.sortable !== false && handleSort(col.key)}
                className={`text-left py-3 px-3 text-xs font-medium text-slate-400 uppercase tracking-wider ${
                  col.sortable !== false ? "cursor-pointer hover:text-slate-600 select-none" : ""
                }`}
              >
                <span className="flex items-center gap-1">
                  {col.label}
                  {sortKey === col.key && (
                    sortDir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr
              key={row.id || row.store_id || i}
              onClick={() => onRowClick?.(row)}
              className={`border-b border-gray-50 transition-colors ${
                onRowClick ? "cursor-pointer hover:bg-indigo-50/50" : ""
              } ${i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}
            >
              {columns.map((col) => (
                <td key={col.key} className="py-3 px-3 text-slate-700">
                  {col.render ? col.render(row[col.key], row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="py-8 text-center text-slate-400 text-sm">
                No data available
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add server/dashboard/src/components/StatCard.jsx \
        server/dashboard/src/components/PageHeader.jsx \
        server/dashboard/src/components/TimeRangeSelector.jsx \
        server/dashboard/src/components/DataTable.jsx
git commit -m "feat: add shared UI components (StatCard, PageHeader, TimeRangeSelector, DataTable)"
```

---

### Task 6: Sidebar Layout

**Files:**
- Create: `server/dashboard/src/components/Sidebar.jsx`
- Modify: `server/dashboard/src/components/Layout.jsx` (full rewrite — replace top nav with sidebar layout)

- [ ] **Step 1: Create Sidebar.jsx**

```jsx
// server/dashboard/src/components/Sidebar.jsx

import { NavLink } from "react-router-dom";
import {
  LayoutDashboard, DollarSign, Store, Bell, Shield,
  MessageSquare, Settings, PanelLeftClose, PanelLeft, LogOut,
} from "lucide-react";

const navItems = [
  { to: "/dashboard",          label: "Overview",  icon: LayoutDashboard, end: true },
  { to: "/dashboard/revenue",  label: "Revenue",   icon: DollarSign },
  { to: "/dashboard/stores",   label: "Stores",    icon: Store },
  { to: "/dashboard/alerts",   label: "Alerts",    icon: Bell },
  { to: "/dashboard/disputes", label: "Disputes",  icon: Shield },
  { to: "/dashboard/chat",     label: "AI Chat",   icon: MessageSquare },
  { to: "/dashboard/system",   label: "System",    icon: Settings },
];

export default function Sidebar({ collapsed, onToggle, onLogout, badgeCount }) {
  return (
    <aside
      className={`fixed left-0 top-0 h-full bg-white border-r border-gray-200 z-30 flex flex-col transition-all duration-200 ${
        collapsed ? "w-[60px]" : "w-[200px]"
      }`}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-3 h-14 border-b border-gray-100 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
          W
        </div>
        {!collapsed && (
          <span className="text-sm font-bold text-slate-900 truncate">WCM</span>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex-1 py-3 px-2 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const showBadge = item.label === "Alerts" && badgeCount > 0;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors relative ${
                  isActive
                    ? "bg-indigo-50 text-indigo-600"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                }`
              }
            >
              <Icon size={18} className="shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
              {showBadge && (
                <span className={`min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full bg-red-500 text-white flex items-center justify-center ${
                  collapsed ? "absolute -top-0.5 -right-0.5" : "ml-auto"
                }`}>
                  {badgeCount > 99 ? "99+" : badgeCount}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Bottom actions */}
      <div className="border-t border-gray-100 p-2 space-y-1">
        <button
          onClick={onToggle}
          className="flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm text-slate-400 hover:bg-slate-50 hover:text-slate-600 w-full transition-colors"
        >
          {collapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
          {!collapsed && <span>Collapse</span>}
        </button>
        <button
          onClick={onLogout}
          className="flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm text-slate-400 hover:bg-red-50 hover:text-red-500 w-full transition-colors"
        >
          <LogOut size={18} />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Rewrite Layout.jsx**

Replace the entire content of `server/dashboard/src/components/Layout.jsx`:

```jsx
// server/dashboard/src/components/Layout.jsx

import { Outlet } from "react-router-dom";
import { useEffect, useState, useCallback } from "react";
import { api, apiPost } from "../api/client";
import { RefreshCw, WifiOff, Menu, X } from "lucide-react";
import Sidebar from "./Sidebar";

export default function Layout({ onLogout }) {
  const [overview, setOverview] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [secondsAgo, setSecondsAgo] = useState(0);
  const [online, setOnline] = useState(true);
  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem("sidebar-collapsed");
    return saved === "true";
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  async function handleLogout() {
    try { await apiPost("/api/auth/logout", {}); } catch (_) {}
    onLogout?.();
  }

  const refresh = useCallback(() => {
    api("/api/dashboard")
      .then((d) => { setOverview(d.overview); setLastUpdated(Date.now()); setOnline(true); })
      .catch(() => setOnline(false));
  }, []);

  useEffect(() => { refresh(); const t = setInterval(refresh, 60000); return () => clearInterval(t); }, [refresh]);

  useEffect(() => {
    const t = setInterval(() => {
      if (lastUpdated) setSecondsAgo(Math.round((Date.now() - lastUpdated) / 1000));
    }, 5000);
    return () => clearInterval(t);
  }, [lastUpdated]);

  useEffect(() => {
    const crit = overview?.criticalAlerts || 0;
    document.title = crit > 0 ? `(${crit}) WooCommerce Monitor` : "WooCommerce Monitor";
  }, [overview?.criticalAlerts]);

  function toggleCollapse() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("sidebar-collapsed", String(next));
  }

  const badgeCount = (overview?.criticalAlerts || 0) + (overview?.highAlerts || 0);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Desktop sidebar */}
      <div className="hidden sm:block">
        <Sidebar
          collapsed={collapsed}
          onToggle={toggleCollapse}
          onLogout={handleLogout}
          badgeCount={badgeCount}
        />
      </div>

      {/* Mobile overlay sidebar */}
      {mobileOpen && (
        <>
          <div className="fixed inset-0 bg-black/30 z-20 sm:hidden" onClick={() => setMobileOpen(false)} />
          <div className="fixed left-0 top-0 h-full z-30 sm:hidden">
            <Sidebar
              collapsed={false}
              onToggle={() => setMobileOpen(false)}
              onLogout={handleLogout}
              badgeCount={badgeCount}
            />
          </div>
        </>
      )}

      {/* Main content area — offset by sidebar width */}
      <div className={`transition-all duration-200 ${collapsed ? "sm:ml-[60px]" : "sm:ml-[200px]"}`}>
        {/* Top bar */}
        <header className="sticky top-0 bg-white/80 backdrop-blur-sm border-b border-gray-100 z-10 h-14 flex items-center justify-between px-4 sm:px-6">
          {/* Mobile hamburger */}
          <button className="sm:hidden p-1.5 hover:bg-slate-100 rounded-lg" onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X size={18} /> : <Menu size={18} className="text-slate-600" />}
          </button>

          <div className="hidden sm:block" /> {/* spacer for desktop */}

          {/* Right side: status + refresh */}
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-1.5 text-xs ${online ? "text-emerald-500" : "text-red-400"}`}>
              {online
                ? <>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>{secondsAgo < 10 ? "Live" : `${secondsAgo}s ago`}</span>
                  </>
                : <><WifiOff size={12} /><span>Offline</span></>
              }
            </div>
            <button
              onClick={refresh}
              className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-600"
              title="Refresh now"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          <Outlet context={{ overview, refresh }} />
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add server/dashboard/src/components/Sidebar.jsx \
        server/dashboard/src/components/Layout.jsx
git commit -m "feat: replace top nav with sidebar layout (Sidebar.jsx + Layout.jsx rewrite)"
```

---

## Chunk 3: Revenue Page + Overview Enhancement + Page Restyling

### Task 7: Revenue Dashboard Page

**Files:**
- Create: `server/dashboard/src/pages/Revenue.jsx`
- Modify: `server/dashboard/src/App.jsx` (add Revenue route)

- [ ] **Step 1: Create Revenue.jsx**

```jsx
// server/dashboard/src/pages/Revenue.jsx

import { useEffect, useState } from "react";
import { api } from "../api/client";
import { Line, Doughnut } from "react-chartjs-2";
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
  Title, Tooltip, Legend, Filler, ArcElement,
} from "chart.js";
import { DollarSign, ShoppingCart, AlertCircle, ShoppingBag, X } from "lucide-react";
import StatCard from "../components/StatCard";
import PageHeader from "../components/PageHeader";
import TimeRangeSelector from "../components/TimeRangeSelector";
import DataTable from "../components/DataTable";
import { SkeletonCard } from "../components/Skeleton";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler, ArcElement);

const PERIOD_TO_DAYS = { today: 1, "7d": 7, "30d": 30, "90d": 90 };

export default function Revenue() {
  const [period, setPeriod] = useState("7d");
  const [summary, setSummary] = useState(null);
  const [timeline, setTimeline] = useState(null);
  const [stores, setStores] = useState(null);
  const [filterStore, setFilterStore] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  function fetchData(p, storeId) {
    setLoading(true);
    const days = PERIOD_TO_DAYS[p] || 7;
    const storeParam = storeId ? `&store=${storeId}` : "";
    Promise.all([
      api(`/api/revenue?period=${p}${storeParam}`),
      api(`/api/revenue/timeline?days=${days}${storeParam}`),
      api(`/api/revenue/stores?period=${p}`),
    ])
      .then(([sum, tl, st]) => {
        setSummary(sum);
        setTimeline(tl.timeline);
        setStores(st.stores);
        setError(null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetchData(period, filterStore); }, [period, filterStore]);
  useEffect(() => { const t = setInterval(() => fetchData(period, filterStore), 60000); return () => clearInterval(t); }, [period, filterStore]);

  function handlePeriod(p) { setPeriod(p); setFilterStore(null); }
  function handleStoreClick(row) {
    setFilterStore(filterStore === row.store_id ? null : row.store_id);
  }

  if (error) return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700 flex items-center gap-3">
      <AlertCircle size={18} /> {error}
    </div>
  );

  // Empty state — no data synced yet
  if (!loading && summary && summary.totalOrders === 0 && (!stores || stores.length === 0)) {
    return (
      <div>
        <PageHeader title="Revenue" subtitle="Revenue data across all stores">
          <TimeRangeSelector value={period} onChange={handlePeriod} />
        </PageHeader>
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <DollarSign size={40} className="mx-auto text-slate-300 mb-4" />
          <h3 className="text-lg font-semibold text-slate-700 mb-2">Revenue data is syncing</h3>
          <p className="text-sm text-slate-400 mb-4">First sync may take a few minutes for all stores.</p>
          <button
            onClick={() => api("/api/revenue/sync", { method: "POST" }).then(() => fetchData(period, null))}
            className="px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-600 transition-colors"
          >
            Sync Now
          </button>
        </div>
      </div>
    );
  }

  // Chart data
  const chartData = timeline ? {
    labels: timeline.map((t) => {
      const d = new Date(t.date + "T00:00:00Z");
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }),
    datasets: [
      {
        label: "Revenue",
        data: timeline.map((t) => t.revenue),
        borderColor: "#6366f1",
        backgroundColor: (ctx) => {
          const gradient = ctx.chart.ctx.createLinearGradient(0, 0, 0, ctx.chart.height);
          gradient.addColorStop(0, "rgba(99, 102, 241, 0.15)");
          gradient.addColorStop(1, "rgba(99, 102, 241, 0)");
          return gradient;
        },
        fill: true,
        tension: 0.4,
        pointRadius: 3,
        pointHoverRadius: 6,
        pointBackgroundColor: "#6366f1",
        borderWidth: 2,
      },
    ],
  } : null;

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "#1e293b",
        titleColor: "#94a3b8",
        bodyColor: "#f1f5f9",
        padding: 12,
        cornerRadius: 8,
        callbacks: {
          label: (ctx) => ` $${ctx.parsed.y.toLocaleString()}`,
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 11 }, color: "#94a3b8" } },
      y: {
        beginAtZero: true,
        ticks: {
          font: { size: 11 },
          color: "#94a3b8",
          callback: (v) => `$${v >= 1000 ? (v / 1000).toFixed(0) + "k" : v}`,
        },
        grid: { color: "#f1f5f9" },
      },
    },
  };

  // Orders by status donut
  const statusData = summary ? {
    labels: ["Completed", "Processing", "Pending", "Failed", "Refunded"],
    datasets: [{
      data: [
        summary.completedCount || 0,
        summary.processingCount || 0,
        summary.pendingCount || 0,
        summary.failedCount || 0,
        summary.refundedCount || 0,
      ],
      backgroundColor: ["#34d399", "#6366f1", "#fbbf24", "#94a3b8", "#f87171"],
      borderWidth: 0,
    }],
  } : null;

  const storeColumns = [
    { key: "store_name", label: "Store", sortable: true },
    { key: "revenue", label: "Revenue", sortable: true, render: (v) => `$${(v || 0).toLocaleString()}` },
    { key: "orders", label: "Orders", sortable: true },
    { key: "failed", label: "Failed", sortable: true },
    { key: "avg_order_value", label: "Avg Order", sortable: true, render: (v) => `$${(v || 0).toFixed(2)}` },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Revenue" subtitle="Revenue data across all stores">
        <TimeRangeSelector value={period} onChange={handlePeriod} />
      </PageHeader>

      {/* Stat cards */}
      {loading && !summary ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Total Revenue" value={`$${(summary.totalRevenue || 0).toLocaleString()}`}
            icon={<DollarSign size={18} />} variant="hero"
            change={summary.revenueChange}
          />
          <StatCard
            label="Total Orders" value={summary.totalOrders?.toLocaleString() || "0"}
            icon={<ShoppingCart size={18} />}
            change={summary.ordersChange}
          />
          <StatCard
            label="Failed Payments" value={summary.failedCount || 0}
            icon={<AlertCircle size={18} />} sub="informational"
          />
          <StatCard
            label="Abandoned Carts" value={summary.abandonedCarts || "N/A"}
            icon={<ShoppingBag size={18} />} sub="from cart tracking"
          />
        </div>
      )}

      {/* Revenue chart */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-700">
            Revenue Trend
          </h2>
          {filterStore && (
            <button
              onClick={() => setFilterStore(null)}
              className="flex items-center gap-1 px-2 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-medium hover:bg-indigo-100"
            >
              {stores?.find(s => s.store_id === filterStore)?.store_name || "Store"} <X size={12} />
            </button>
          )}
        </div>
        <div style={{ height: 280 }}>
          {chartData ? <Line data={chartData} options={chartOptions} /> : <SkeletonCard className="h-full" />}
        </div>
      </div>

      {/* Per-store table + status donut */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Revenue by Store</h2>
          {stores ? (
            <DataTable columns={storeColumns} data={stores} onRowClick={handleStoreClick} />
          ) : (
            <SkeletonCard className="h-48" />
          )}
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Orders by Status</h2>
          {statusData ? (
            <Doughnut
              data={statusData}
              options={{
                responsive: true,
                plugins: {
                  legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 11 }, padding: 12 } },
                },
                cutout: "65%",
              }}
            />
          ) : (
            <SkeletonCard className="h-48" />
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add Revenue route to App.jsx**

In `server/dashboard/src/App.jsx`, add the import:

```jsx
import Revenue from "./pages/Revenue";
```

And add the route inside the `<Route path="/dashboard" ...>` group, after the index route:

```jsx
<Route path="revenue" element={<Revenue />} />
```

- [ ] **Step 3: Commit**

```bash
git add server/dashboard/src/pages/Revenue.jsx server/dashboard/src/App.jsx
git commit -m "feat: add Revenue dashboard page with charts, stat cards, and per-store table"
```

---

### Task 8: Restyle Overview Page

**Files:**
- Modify: `server/dashboard/src/pages/Overview.jsx` (restyle + add revenue snapshot)

- [ ] **Step 1: Rewrite Overview.jsx**

Replace the entire content of `server/dashboard/src/pages/Overview.jsx`:

```jsx
// server/dashboard/src/pages/Overview.jsx

import { useEffect, useState } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import AlertTrendsChart from "../components/AlertTrendsChart";
import HealthDistribution from "../components/HealthDistribution";
import StatCard from "../components/StatCard";
import PageHeader from "../components/PageHeader";
import { SkeletonCard, SkeletonRow } from "../components/Skeleton";
import { timeAgo, seenStatus } from "../utils/time";
import {
  Store, AlertTriangle, Activity, TrendingUp, Clock,
  DollarSign, ShoppingCart, ArrowRight,
} from "lucide-react";

export default function Overview() {
  const [data, setData] = useState(null);
  const [revenue, setRevenue] = useState(null);
  const [error, setError] = useState(null);
  const { refresh: layoutRefresh } = useOutletContext() || {};
  const navigate = useNavigate();

  useEffect(() => {
    api("/api/dashboard").then(setData).catch((e) => setError(e.message));
    api("/api/revenue?period=today").then(setRevenue).catch(() => {});
    const t = setInterval(() => {
      api("/api/dashboard").then(setData).catch(() => {});
      api("/api/revenue?period=today").then(setRevenue).catch(() => {});
    }, 60000);
    return () => clearInterval(t);
  }, []);

  if (error) return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700 flex items-center gap-3">
      <AlertTriangle size={18} /> {error}
    </div>
  );

  if (!data) return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <SkeletonCard className="h-56" />
        <SkeletonCard className="h-56" />
      </div>
    </div>
  );

  const o = data.overview;

  return (
    <div className="space-y-6">
      <PageHeader title="Overview" subtitle="Multi-store monitoring at a glance" />

      {/* Main stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Stores" value={o.totalSites}
          icon={<Store size={18} />} variant="hero"
          sub="monitored"
        />
        <StatCard
          label="Total Alerts" value={o.totalAlerts}
          icon={<Activity size={18} />} sub="all time"
        />
        <StatCard
          label="Critical" value={o.criticalAlerts}
          icon={<AlertTriangle size={18} />}
          sub={o.criticalAlerts > 0 ? "needs attention" : "all clear"}
          pulse={o.criticalAlerts > 0}
        />
        <StatCard
          label="High" value={o.highAlerts}
          icon={<TrendingUp size={18} />}
          sub={o.highAlerts > 0 ? "review soon" : "all clear"}
        />
      </div>

      {/* Revenue snapshot row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign size={14} className="text-indigo-500" />
            <span className="text-xs font-medium text-slate-400 uppercase">Today's Revenue</span>
          </div>
          <p className="text-2xl font-bold text-slate-900">
            {revenue ? `$${(revenue.totalRevenue || 0).toLocaleString()}` : "\u2014"}
          </p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-2">
            <ShoppingCart size={14} className="text-indigo-500" />
            <span className="text-xs font-medium text-slate-400 uppercase">Orders Today</span>
          </div>
          <p className="text-2xl font-bold text-slate-900">
            {revenue ? (revenue.totalOrders || 0).toLocaleString() : "\u2014"}
          </p>
        </div>
        <button
          onClick={() => navigate("/dashboard/revenue")}
          className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-colors text-left group"
        >
          <div className="flex items-center gap-2 mb-2">
            <Activity size={14} className="text-indigo-500" />
            <span className="text-xs font-medium text-slate-400 uppercase">Revenue</span>
          </div>
          <p className="text-sm font-medium text-indigo-600 flex items-center gap-1">
            View Dashboard <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
          </p>
        </button>
      </div>

      {/* Charts */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <Activity size={15} className="text-indigo-500" /> Alert Trends (7 days)
          </h2>
          <AlertTrendsChart trends={o.alertTrends} />
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <Store size={15} className="text-indigo-500" /> Store Health
          </h2>
          <HealthDistribution distribution={o.healthDistribution} />
        </div>
      </div>

      {/* Stores grid */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
          <Store size={15} className="text-slate-400" /> Stores
        </h2>
        {data.stores.length === 0
          ? <p className="text-slate-400 text-sm text-center py-6">No stores connected.</p>
          : <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {data.stores.map((s) => <StoreChip key={s.id} store={s} />)}
            </div>
        }
      </div>

      {/* Recent alerts */}
      {data.recentAlerts.length > 0 && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <Clock size={15} className="text-slate-400" /> Recent Alerts
          </h2>
          <div className="space-y-2">
            {data.recentAlerts.slice(0, 8).map((a) => (
              <div key={a.id} className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors">
                <SeverityDot severity={a.severity} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{a.subject}</p>
                  <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                    {timeAgo(a.timestamp)}
                    {a.type && <span className="bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded text-[10px]">{a.type}</span>}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StoreChip({ store }) {
  const status = seenStatus(store.last_seen);
  const dotColors = { good: "bg-emerald-400", warning: "bg-amber-400", stale: "bg-red-400", never: "bg-gray-300" };

  return (
    <div className="border border-gray-100 rounded-xl p-4 flex items-start gap-3 bg-white hover:border-gray-200 transition-colors">
      <div className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${dotColors[status]}`} />
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-800 truncate">{store.name}</p>
        <p className="text-xs text-slate-400 truncate">{store.url}</p>
        <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
          <Clock size={10} />
          {store.last_seen ? timeAgo(store.last_seen) : "Never seen"}
          {store.hasApiCredentials && (
            <span className="ml-1 bg-indigo-50 text-indigo-600 px-1.5 rounded text-[10px]">API</span>
          )}
        </p>
      </div>
    </div>
  );
}

function SeverityDot({ severity }) {
  const colors = {
    critical: "bg-red-500", high: "bg-orange-500",
    medium: "bg-amber-400", success: "bg-emerald-500", warning: "bg-amber-400",
  };
  return <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${colors[severity] || "bg-slate-300"}`} />;
}
```

- [ ] **Step 2: Commit**

```bash
git add server/dashboard/src/pages/Overview.jsx
git commit -m "feat: restyle Overview with shared StatCard, revenue snapshot, and new theme"
```

---

### Task 9: Restyle Remaining Pages

**Files:**
- Modify: `server/dashboard/src/pages/Stores.jsx`
- Modify: `server/dashboard/src/pages/Alerts.jsx`
- Modify: `server/dashboard/src/pages/Disputes.jsx`
- Modify: `server/dashboard/src/pages/Chat.jsx`
- Modify: `server/dashboard/src/pages/System.jsx`
- Modify: `server/dashboard/src/pages/Login.jsx`
- Modify: `server/dashboard/src/components/AlertTrendsChart.jsx`

This task is a visual consistency pass. For each page:

1. Change `rounded-2xl` to `rounded-xl` (consistent border radius)
2. Change blue accent colors to indigo where used as primary (e.g., `text-blue-500` → `text-indigo-500` for icons)
3. Change `bg-purple-100 text-purple-600` badges to `bg-indigo-50 text-indigo-600`
4. Ensure card pattern is `bg-white rounded-xl p-6 shadow-sm border border-gray-100`
5. Add `PageHeader` component at the top of each page where appropriate

- [ ] **Step 1: Update AlertTrendsChart colors**

In `server/dashboard/src/components/AlertTrendsChart.jsx`, change the "Total" dataset's `borderColor` from `"#3b82f6"` to `"#6366f1"` (indigo-500) and `backgroundColor` from `"rgba(59,130,246,0.08)"` to `"rgba(99,102,241,0.08)"`. Change `pointBackgroundColor` from `"#3b82f6"` to `"#6366f1"`.

- [ ] **Step 2: Restyle each page**

For each of the 6 pages (Stores, Alerts, Disputes, Chat, System, Login):
- Read the file
- Replace `rounded-2xl` with `rounded-xl` globally
- Replace primary blue accents (`text-blue-500`, `bg-blue-500`, `bg-blue-50`) with indigo equivalents (`text-indigo-500`, `bg-indigo-500`, `bg-indigo-50`)
- Replace `bg-purple-100 text-purple-600` with `bg-indigo-50 text-indigo-600`
- Add `PageHeader` import and use it at the top where there's a manual title
- Keep all functional code unchanged

- [ ] **Step 3: Commit**

```bash
git add server/dashboard/src/pages/ server/dashboard/src/components/AlertTrendsChart.jsx
git commit -m "style: restyle all pages with consistent indigo theme and rounded-xl cards"
```

---

### Task 10: Build, Test, and Deploy

- [ ] **Step 1: Build the dashboard**

Run: `cd server/dashboard && npm run build`
Expected: Vite build succeeds with no errors.

- [ ] **Step 2: Test server starts**

Run: `cd server && node -e "require('./src/db').initDB(); const { createApp } = require('./src/app'); const app = createApp(); console.log('Server loads OK')"`
Expected: `[DB] Migration 004 applied` (first time) then `Server loads OK`

- [ ] **Step 3: Start server locally and verify**

Run: `cd server && node src/index.js`
- Open `http://localhost:3000` in browser
- Verify sidebar navigation renders
- Verify all existing pages load (Overview, Stores, Alerts, Disputes, Chat, System)
- Verify Revenue page loads (may show empty state if no API creds in local DB)
- Verify Overview shows revenue snapshot row

- [ ] **Step 4: Commit any build output fixes**

If the build revealed any issues, fix and commit.

- [ ] **Step 5: Create release zip + deploy**

Follow existing deployment process:
1. Create release zip with updated version numbers
2. Deploy server to Coolify
3. Verify at woo.ashbi.ca

This step depends on Cameron's go-ahead — confirm before deploying.
