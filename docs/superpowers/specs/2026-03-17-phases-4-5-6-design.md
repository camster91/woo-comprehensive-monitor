# Phases 4, 5, 6 — Uptime, Client Portal, Inventory — Design Spec

## Phase 4: Uptime & Performance Monitoring

### DB Migration (006_uptime_checks.sql)
```sql
CREATE TABLE IF NOT EXISTS uptime_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id TEXT,
  status_code INTEGER,
  response_time_ms INTEGER,
  ssl_expiry_date TEXT,
  ssl_days_remaining INTEGER,
  wp_version TEXT,
  wc_version TEXT,
  plugin_versions TEXT DEFAULT '{}',
  checked_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_uptime_store ON uptime_checks(store_id, checked_at);
```

### Service: `uptime-service.js`
- `checkStore(store)` — HTTP HEAD to store URL (5s timeout), measure TTFB. Parse SSL cert expiry via TLS socket. Return {status_code, response_time_ms, ssl_expiry_date, ssl_days_remaining}.
- `checkAllStores()` — p-limit(5) concurrency. For each store: run checkStore, insert into uptime_checks, create alerts for: down (status != 200), SSL < 14 days, response > 5000ms.
- `getUptimeSummary()` — latest check per store + 24h uptime percentage.
- `getSSLStatus()` — all stores sorted by ssl_days_remaining ASC.
- `getVersions()` — latest WP/WC versions from stores table.
- Cron: every 5 minutes (`*/5 * * * *`), offset to minute 2 (`2,7,12,...`).

### Route: `routes/uptime.js`
- `GET /api/uptime` — summary (up/down counts, avg response, ssl warnings)
- `GET /api/uptime/checks?store=<id>` — recent checks for a store
- `GET /api/uptime/ssl` — SSL expiry list
- `GET /api/uptime/versions` — WP/WC version list

### Dashboard: `pages/Uptime.jsx`
- Add route + sidebar nav item (Globe icon)
- Stat cards: Sites Up, Sites Down, Avg Response, SSL Warnings
- Store uptime grid: cards with status dot, response time, uptime %
- SSL expiry table (DataTable, sorted soonest first, red < 14d, yellow < 30d)
- Version table (WP, WC per store)

---

## Phase 5: Client Portal

### DB Migration (007_portal_users.sql)
```sql
CREATE TABLE IF NOT EXISTS portal_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  password_hash TEXT NOT NULL,
  token TEXT,
  token_expires TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
);
```

### Service: `portal-service.js`
- `createPortalUser({storeId, email, name, password})` — hash password with crypto.scryptSync, insert.
- `authenticatePortal(email, password)` — verify hash, generate token, return {token, user, store}.
- `getPortalUser(token)` — validate token, return user + store info.
- `listPortalUsers()` — admin view, all portal users.
- `deletePortalUser(id)` — remove user.

### Route: `routes/portal.js`
- `POST /api/portal/login` — authenticate, return token
- `GET /api/portal/dashboard` — filtered overview for user's store
- `GET /api/portal/revenue?period=7d` — revenue for user's store only
- `GET /api/portal/disputes` — disputes for user's store only
- `GET /api/portal/alerts` — alerts for user's store only

Portal routes use a separate `portalAuthMiddleware` that checks portal_users tokens (not admin tokens).

### Admin routes (added to existing routes):
- `GET /api/portal-users` — list all portal users (admin only)
- `POST /api/portal-users` — create portal user (admin only)
- `DELETE /api/portal-users/:id` — delete portal user (admin only)

### Dashboard changes:
- New admin page `pages/PortalUsers.jsx` — manage portal users (CRUD table). Add to sidebar as "Portal" (Users icon).
- New React route tree `/portal/*` with `PortalLayout.jsx` — simplified sidebar (Overview, Revenue, Disputes, Alerts only). Uses same indigo theme.
- New `pages/portal/PortalOverview.jsx` — single-store dashboard.
- `App.jsx` updated: if URL starts with `/portal`, render portal layout; else admin layout.
- `Login.jsx` gets a "Client Login" link that routes to `/portal/login`.
- `pages/portal/PortalLogin.jsx` — simple login form for portal users.

### Weekly Email Digest:
- Cron: Monday 9am (`0 9 * * 1`).
- For each portal user: query their store's revenue (last 7d), orders, disputes, alerts. Compile HTML email. Send via existing email-service.

---

## Phase 6: Inventory & Product Alerts

### DB Migration (008_product_snapshots.sql)
```sql
CREATE TABLE IF NOT EXISTS product_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id TEXT,
  product_id INTEGER NOT NULL,
  name TEXT,
  sku TEXT,
  stock_status TEXT,
  stock_quantity INTEGER,
  price REAL,
  regular_price REAL,
  synced_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_store ON product_snapshots(store_id, product_id);
CREATE INDEX IF NOT EXISTS idx_product_stock ON product_snapshots(stock_status);
```

### Service: `inventory-service.js`
- `syncStoreProducts(store)` — WC REST API `GET /wc/v3/products?status=publish&per_page=100`, paginate. For each product: compare to existing snapshot, detect price changes. Upsert into product_snapshots. Create alerts for out_of_stock, low_stock (<5), price_change.
- `syncAllStores()` — p-limit(3), mutex guard. Called from revenue sync cron (piggyback, runs after revenue sync).
- `getInventorySummary()` — counts: total products, out_of_stock, low_stock, recent price changes.
- `getOutOfStock()` — all products where stock_status='outofstock'.
- `getLowStock(threshold=5)` — products where stock_quantity <= threshold and stock_status='instock'.
- `getPriceChanges(days=7)` — detected via alerts table (type='inventory').

### Route: `routes/inventory.js`
- `GET /api/inventory` — summary stats
- `GET /api/inventory/out-of-stock` — out of stock list
- `GET /api/inventory/low-stock?threshold=5` — low stock list
- `GET /api/inventory/price-changes?days=7` — recent price changes

### Dashboard: `pages/Inventory.jsx`
- Add route + sidebar nav item (Package icon)
- Stat cards: Total Products, Out of Stock, Low Stock, Price Changes
- Out of stock table (DataTable: store, product, SKU)
- Low stock table (DataTable: store, product, SKU, qty remaining)
- Price changes table (DataTable: store, product, old price, new price, date)

---

## File Changes Summary

### New Files
| File | Phase |
|------|-------|
| `server/migrations/006_uptime_checks.sql` | 4 |
| `server/migrations/007_portal_users.sql` | 5 |
| `server/migrations/008_product_snapshots.sql` | 6 |
| `server/src/services/uptime-service.js` | 4 |
| `server/src/services/portal-service.js` | 5 |
| `server/src/services/inventory-service.js` | 6 |
| `server/src/routes/uptime.js` | 4 |
| `server/src/routes/portal.js` | 5 |
| `server/src/routes/inventory.js` | 6 |
| `server/src/middleware/portal-auth.js` | 5 |
| `server/dashboard/src/pages/Uptime.jsx` | 4 |
| `server/dashboard/src/pages/Inventory.jsx` | 6 |
| `server/dashboard/src/pages/PortalUsers.jsx` | 5 |
| `server/dashboard/src/pages/portal/PortalLogin.jsx` | 5 |
| `server/dashboard/src/pages/portal/PortalOverview.jsx` | 5 |
| `server/dashboard/src/components/PortalLayout.jsx` | 5 |

### Modified Files
| File | Changes |
|------|---------|
| `server/src/db.js` | Add migrations 006, 007, 008 |
| `server/src/app.js` | Mount uptime, portal, inventory routes |
| `server/src/index.js` | Add uptime cron (5min), inventory sync (piggyback on revenue), weekly digest cron |
| `server/dashboard/src/App.jsx` | Add Uptime, Inventory, PortalUsers routes + portal route tree |
| `server/dashboard/src/components/Sidebar.jsx` | Add Uptime, Inventory, Portal nav items |
