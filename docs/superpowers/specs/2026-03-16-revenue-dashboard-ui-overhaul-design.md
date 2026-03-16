# Revenue Dashboard + UI Overhaul — Design Spec

## Overview

Add a server-side revenue data collection service that polls WooCommerce REST API across all 33 stores, a new Revenue dashboard page with charts and per-store breakdown, and a full UI overhaul converting the dashboard from top-nav admin panel to modern SaaS sidebar layout with indigo/violet gradient theme.

## Context

- **Current state:** v4.8.0 plugin, v3.1.0 server. 33 WooCommerce stores on Hostinger, monitoring server on Coolify VPS at woo.ashbi.ca. Working: error tracking, health checks, dispute detection/sync, email alerts, heartbeats, evidence staging, subscription convert/cancel.
- **Stack:** PHP plugin + Node.js/Express 5/SQLite (better-sqlite3) server + React 19/Tailwind 4/Vite 7/Chart.js dashboard.
- **Existing pages:** Overview, Stores, Alerts, Disputes, AI Chat, System.
- **WC REST API credentials** already stored on server for stores that have them configured.
- **Dependencies already installed:** `@woocommerce/woocommerce-rest-api`, `p-limit`, `node-cron`, `chart.js`, `react-chartjs-2`.

## Users

- **Cameron (owner):** Manages all 33 stores. Wants aggregate revenue view and per-store drill-down.
- **Natalie (ops):** Day-to-day operations. Needs intuitive, non-technical UI.
- **Future:** Influencers/brand owners via client portal (Phase 5 — not in scope here).

## Approach

Incremental build (Approach A):
1. Revenue service + DB migration + API routes
2. Sidebar layout + theme overhaul (all pages restyled)
3. Revenue page with charts
4. Enhanced Overview page with revenue summary

Each step is independently deployable.

---

## Section 1: Revenue Data Backend

### Database Migration (004_revenue_snapshots.sql)

New table `revenue_snapshots`:

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PRIMARY KEY | Auto-increment |
| store_id | TEXT | FK → stores(id) ON DELETE CASCADE |
| date | TEXT | YYYY-MM-DD |
| total_revenue | REAL | Sum of completed/processing order totals |
| order_count | INTEGER | Total orders for the day |
| orders_processing | INTEGER | Status: processing |
| orders_completed | INTEGER | Status: completed |
| orders_refunded | INTEGER | Status: refunded |
| orders_failed | INTEGER | Status: failed |
| orders_pending | INTEGER | Status: pending / on-hold |
| refund_total | REAL | Sum of refunds |
| abandoned_carts | INTEGER | From cart tracking plugin |
| currency | TEXT | Default 'USD' |
| synced_at | TEXT | Last sync timestamp |

Unique constraint: `UNIQUE(store_id, date)`.
Indexes: `idx_revenue_store_date` on `(store_id, date)`, `idx_revenue_date` on `(date)`.

### Revenue Service (`src/services/revenue-service.js`)

**Functions:**

- `syncStoreRevenue(store)` — Instantiates WooCommerceRestApi with store's credentials. Fetches orders from WC REST API (`GET /wc/v3/orders`) with date range filter and `per_page=100`, paginating as needed. Groups by date, aggregates counts by status and revenue totals. Upserts into `revenue_snapshots` using `INSERT OR REPLACE`. Timeout: 30s per store. Skips stores without API credentials.

- `syncAllStores()` — Gets all stores with API credentials from store-service. Iterates with `p-limit(3)` concurrency to avoid overwhelming Hostinger shared hosting. Logs sync progress. Returns summary (synced count, failed count, errors).

- `getRevenueSummary(period, storeId?)` — Queries `revenue_snapshots` for the given period (today/7d/30d/90d). Returns: total revenue, total orders, failed count, abandoned carts, refund total, and % change vs previous equivalent period. Optional storeId filter for single-store view.

- `getRevenueTimeline(days, storeId?)` — Returns array of `{date, revenue, orders}` for charting. Aggregates across all stores unless storeId provided. Fills gaps with zeros for days with no data.

- `getRevenueByStore(period)` — Returns per-store breakdown: store name, revenue, orders, failed, avg order value. Sorted by revenue descending.

- `getFailedPayments(days, storeId?)` — Returns failed + pending order counts grouped by day.

**Cron schedule:** Registered in `src/index.js` using existing `node-cron`. Every 30 minutes (`*/30 * * * *`). On first run (no data in table), backfills last 90 days by fetching orders with `after` date filter.

**Error handling:** Per-store try/catch. Failed stores logged but don't block others. Stores with invalid/expired credentials get a warning alert created via alert-service (severity: medium, type: "revenue_sync").

### API Routes (`src/routes/revenue.js`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/revenue?period=7d&store=<id>` | Revenue summary stats |
| GET | `/api/revenue/timeline?days=30&store=<id>` | Daily revenue series for charts |
| GET | `/api/revenue/stores?period=7d` | Per-store revenue comparison |
| GET | `/api/revenue/failed?days=7&store=<id>` | Failed payment counts |
| POST | `/api/revenue/sync` | Trigger manual sync (admin action) |

All routes are behind existing auth middleware (cookie/token auth).

### Abandoned Carts

Stores have existing cart tracking plugins. Two paths to get the data:

1. **Primary:** If WC REST API exposes cart abandonment data (via plugin's REST endpoints), revenue-service queries it during sync.
2. **Fallback:** Add `cart_abandonment_stats` to the VALID_TYPES set in `tracking.js`. Plugin pushes daily count via existing `/api/track-woo-error` endpoint. Stored in `revenue_snapshots.abandoned_carts`.

If neither source provides data, the abandoned carts stat shows "N/A" — not an error.

---

## Section 2: UI Overhaul — Sidebar Layout + Theme

### Layout Change

**Current:** Top navigation bar (gradient header with horizontal tabs).
**New:** Collapsible icon sidebar on the left.

**Sidebar specs:**
- Collapsed width: 60px (icons only)
- Expanded width: 200px (icons + labels)
- Toggle: click hamburger icon at top, or hover to expand (with debounce)
- Mobile: sidebar hidden by default, slides in as overlay on hamburger click, backdrop overlay to dismiss
- Position: fixed left, full height

**Sidebar content (top to bottom):**
1. Logo (W icon in gradient square) — clicking navigates to Overview
2. Nav items with Lucide icons:
   - Overview (LayoutDashboard)
   - Revenue (DollarSign) — NEW
   - Stores (Store)
   - Alerts (Bell) — badge count for critical+high
   - Disputes (Shield)
   - AI Chat (MessageSquare)
   - System (Settings)
3. Divider
4. Collapse/expand toggle
5. Logout button (bottom)

**Active state:** Indigo background pill (`bg-indigo-50 text-indigo-600` or `bg-indigo-500/10`).

**Top area (replacing header):**
- Minimal top bar inside content area: page title (left), "Live" / "Xs ago" indicator + refresh button (right)
- No dark gradient header — clean white/light gray

### Color Theme

| Element | Value |
|---------|-------|
| Page background | `#f8fafc` (slate-50) |
| Card background | white, `border-gray-100`, `shadow-sm` |
| Primary accent | `#6366f1` → `#8b5cf6` (indigo-500 → violet-500 gradient) |
| Hero stat card | Gradient background, white text |
| Secondary stat cards | White bg, dark text |
| Success | `#34d399` (emerald-400) |
| Error/Critical | `#f87171` (red-400) |
| Warning | `#fbbf24` (amber-400) |
| Info/Neutral | `#94a3b8` (slate-400) |
| Heading text | `#0f172a` (slate-900) |
| Body text | `#334155` (slate-700) |
| Secondary text | `#94a3b8` (slate-400) |
| Card border radius | 12px (`rounded-xl`) |
| Sidebar bg | `#f8fafc` with `border-r border-gray-200` |
| Sidebar active | `bg-indigo-50 text-indigo-600` |

### Shared Components

**`StatCard.jsx`** — Reusable stat card with variants:
- `variant="default"`: white card, colored icon, dark value
- `variant="hero"`: gradient background, white text
- Props: `label`, `value`, `change` (% with + or -), `icon`, `sub`, `variant`

**`TimeRangeSelector.jsx`** — Pill toggle for time periods:
- Options: Today, 7d, 30d, 90d
- Active pill: `bg-indigo-50 text-indigo-600`
- Inactive: `bg-gray-100 text-gray-500`
- Props: `value`, `onChange`, `options` (customizable)

**`PageHeader.jsx`** — Consistent page header:
- Props: `title`, `subtitle`, `children` (right-side slot for actions/selectors)

**`DataTable.jsx`** — Sortable table:
- Props: `columns` (array of {key, label, sortable, render}), `data`, `onRowClick`
- Built-in sort state management
- Zebra striping, hover highlight

### Pages Restyled

All existing pages (Overview, Stores, Alerts, Disputes, Chat, System) receive the new card styles, colors, and typography. No functional changes — purely visual consistency pass. The Login page also gets updated to match the new theme (gradient accent on the login card).

---

## Section 3: Revenue Dashboard Page

**Route:** `/dashboard/revenue`

**Layout (top to bottom):**

### 3a. Page Header
`PageHeader` with title "Revenue" and `TimeRangeSelector` in the right slot. Default period: 7d.

### 3b. Hero Stat Cards (4-card grid)
| Card | Variant | Data Source |
|------|---------|-------------|
| Total Revenue | hero (gradient) | `revenue.totalRevenue` |
| Total Orders | default | `revenue.totalOrders` |
| Failed Payments | default (neutral) | `revenue.failedCount` |
| Abandoned Carts | default (neutral) | `revenue.abandonedCarts` |

Each card shows the value + % change vs previous equivalent period. Failed payments and abandoned carts use neutral colors (slate/gray) — not red/alarming, since many are customer-caused.

### 3c. Revenue Trend Chart
- Chart.js Line chart via react-chartjs-2
- X-axis: dates, Y-axis: revenue in dollars
- Line color: indigo-500 with violet gradient fill below
- Tooltip: date + formatted dollar amount
- Responsive, fills card width
- When a store row is clicked (section 3d), chart filters to that store. Click again or "All Stores" button to reset.

### 3d. Per-Store Breakdown Table
`DataTable` with columns:
- Store Name (text, sortable)
- Revenue (currency, sortable, default sort desc)
- Orders (number, sortable)
- Failed (number, sortable)
- Avg Order Value (calculated: revenue / orders, sortable)

Clicking a row filters the trend chart to that store. Active filter shown as a chip above the chart: "Showing: [Store Name] ×"

### 3e. Orders by Status
Small donut chart (Chart.js Doughnut) showing aggregate order status distribution: Processing, Completed, Refunded, Failed, Pending. Positioned beside or below the per-store table depending on viewport.

### Data Flow
- Page mount → `GET /api/revenue?period=7d` + `GET /api/revenue/timeline?days=7` + `GET /api/revenue/stores?period=7d`
- TimeRangeSelector change → re-fetch all 3 endpoints with new period
- Store row click → re-fetch `GET /api/revenue/timeline?days=7&store=<id>`, chart updates
- Auto-refresh: 60s interval (same as Overview)
- Loading state: skeleton cards + skeleton chart (reuse existing Skeleton components)

### Empty State
If `revenue_snapshots` table has no data yet:
- Show message: "Revenue data is syncing. This may take a few minutes for the initial sync."
- Show sync progress if available (X of Y stores synced)
- Manual "Sync Now" button that calls `POST /api/revenue/sync`

---

## Section 4: Enhanced Overview Page

### Changes

1. **Existing stat cards** (Stores, Total Alerts, Critical, High) — restyled with new `StatCard` component. "Stores" card becomes `variant="hero"` with gradient.

2. **New revenue snapshot row** — 3 compact cards below main stats:
   - Today's Revenue (aggregate, formatted as currency)
   - Orders Today (count)
   - "View Revenue →" link card — navigates to `/dashboard/revenue`

3. **Existing charts** (AlertTrendsChart, HealthDistribution) — restyled with new indigo/violet color palette. Same data, same logic.

4. **Existing store chips + recent alerts** — restyled with new card styles. No functional changes.

### Data Source
Revenue snapshot cards call `GET /api/revenue?period=today` on page load (piggybacks on existing 60s refresh cycle). If revenue service hasn't synced yet, shows "—" placeholder.

---

## File Changes Summary

### New Files
| File | Purpose |
|------|---------|
| `server/migrations/004_revenue_snapshots.sql` | Revenue table migration |
| `server/src/services/revenue-service.js` | WC API polling, aggregation, queries |
| `server/src/routes/revenue.js` | Revenue API endpoints |
| `server/dashboard/src/pages/Revenue.jsx` | Revenue dashboard page |
| `server/dashboard/src/components/StatCard.jsx` | Reusable stat card (default + hero variants) |
| `server/dashboard/src/components/TimeRangeSelector.jsx` | Period selector pills |
| `server/dashboard/src/components/PageHeader.jsx` | Page header with title + actions slot |
| `server/dashboard/src/components/DataTable.jsx` | Sortable data table |
| `server/dashboard/src/components/Sidebar.jsx` | New sidebar navigation |

### Modified Files
| File | Changes |
|------|---------|
| `server/src/db.js` | Add migration 004 to versionedMigrations array |
| `server/src/index.js` | Register revenue sync cron job |
| `server/src/app.js` | Mount revenue routes |
| `server/src/routes/tracking.js` | Add `cart_abandonment_stats` to VALID_TYPES |
| `server/dashboard/src/App.jsx` | Add Revenue route |
| `server/dashboard/src/components/Layout.jsx` | Replace top nav with sidebar layout |
| `server/dashboard/src/pages/Overview.jsx` | Restyle + add revenue snapshot row |
| `server/dashboard/src/pages/Stores.jsx` | Restyle to new theme |
| `server/dashboard/src/pages/Alerts.jsx` | Restyle to new theme |
| `server/dashboard/src/pages/Disputes.jsx` | Restyle to new theme |
| `server/dashboard/src/pages/Chat.jsx` | Restyle to new theme |
| `server/dashboard/src/pages/System.jsx` | Restyle to new theme |
| `server/dashboard/src/pages/Login.jsx` | Restyle to new theme |
| `server/dashboard/src/components/AlertTrendsChart.jsx` | Update colors |
| `server/dashboard/src/components/HealthDistribution.jsx` | Update colors |

### Not Changed
- Plugin PHP code — no plugin update needed
- Dispute service, alert service, store service — no changes
- Auth flow — no changes
- Dockerfile — no changes (server already builds dashboard)
