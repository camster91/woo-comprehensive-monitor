# WooCommerce Comprehensive Monitor

**One repo — everything you need.** WordPress plugin + Node.js monitoring server.

- **Plugin** (v4.5.7) — install on your WooCommerce stores → [Download v4.5.7 ZIP](https://github.com/camster91/woo-comprehensive-monitor/releases/tag/v4.5.7)
- **Server** (v3.1.0) — deployed to `https://woo.ashbi.ca` via Coolify (auto-deploys from `Dockerfile` at repo root)

## Plugin Features

| Feature | Description |
|---------|-------------|
| 🚨 Error Tracking | JS, AJAX, checkout error tracking with 30s client-side dedup & rate-limiting |
| 🛡️ Dispute Protection | Stripe webhook integration, auto evidence generation, checkout acknowledgments |
| 🛡️ Subscription Price Protection | Unified charge engine for subscription→one-time conversions |
| 📦 Pre-Orders | Backorders = pre-orders. Card saved at checkout, charged on ship |
| 🏥 Health Monitoring | 15+ checks (WooCommerce, Stripe, SSL, DB, Action Scheduler, WP-Cron) — twicedaily |
| 🧹 Action Scheduler Cleanup | One-click cleanup for stuck/failed WP-Cron tasks |
| 🤖 Auto-Updater | GitHub release checking with backups, compatibility checks, rollback |
| 🔍 File Analysis for AI | Secure file access for AI diagnosis (REST API endpoints) |
| 📊 Admin Dashboard | 8 pages: Dashboard, Errors, Disputes, Acknowledgments, Recovery, Pre-Orders, Health, Settings |
| 💓 Heartbeat | Sends a heartbeat to the monitoring server at the end of every health check run |

## Server Features

| Feature | Description |
|---------|-------------|
| 📡 Multi-Store Monitoring | Receives errors/alerts from all stores with restart-safe deduplication (DB-backed) |
| 🏪 Store Management | Add/remove/update stores via dashboard with stats |
| 📧 Smart Email Alerts | Diagnostic suggestions, severity levels, plugin version awareness, 2h cooldown |
| 🔍 Deep Health Checks | Periodic health checks via WooCommerce REST API (concurrency-limited) |
| 💤 Silent Store Detection | Hourly check alerts if a store stops reporting for 26+ hours |
| 🤖 AI Chat Assistant | DeepSeek AI integration for troubleshooting with markdown rendering |
| 📊 React Dashboard | Modern UI — alert badges, live indicator, expandable alerts, relative timestamps |
| 🗄️ SQLite Backups | Daily `VACUUM INTO` backup, 7 rolling copies in `/data/backups/` |
| 🧹 Auto-Pruning | Nightly alert pruning: 30-day / 10k-row cap |
| 🔒 CORS Lockdown | `/api/track-woo-error` open; all other endpoints restricted to `APP_FQDN` |

## Repo Structure

```
woo-comprehensive-monitor/
├── Dockerfile                             # Coolify deploys the server from here
├── server/                                # Node.js monitoring server (v3.1.0)
│   ├── src/
│   │   ├── app.js                         # Express app, CORS policy
│   │   ├── index.js                       # Entry point, cron jobs
│   │   ├── db.js                          # SQLite + versioned migrations
│   │   ├── routes/
│   │   │   ├── tracking.js                # POST /api/track-woo-error + heartbeat
│   │   │   ├── dashboard.js               # GET /api/dashboard
│   │   │   ├── alerts.js                  # CRUD /api/dashboard/alerts
│   │   │   ├── stores.js                  # Store management
│   │   │   ├── system.js                  # Config, health-check-all, export
│   │   │   └── chat.js                    # DeepSeek AI chat
│   │   └── services/
│   │       ├── alert-service.js           # Dedup, email cooldown, createAlert()
│   │       ├── health-checker.js          # checkAllStores(), checkSilentStores()
│   │       └── store-service.js
│   ├── migrations/
│   │   ├── 001_initial.sql
│   │   └── 002_dedup_key.sql
│   └── dashboard/                         # Vite + React + Tailwind v4 frontend
│       └── src/
│           ├── pages/                     # Overview, Stores, Alerts, Chat, System
│           ├── components/                # Layout (nav+badge), Toast, Skeleton, Charts
│           └── utils/                     # time.js, markdown.js
├── woo-comprehensive-monitor.php          # WordPress plugin main file (v4.5.7)
├── uninstall.php
├── admin/settings.php
├── includes/
│   ├── class-wcm-error-tracker.php
│   ├── class-wcm-dispute-manager.php
│   ├── class-wcm-evidence-generator.php
│   ├── class-wcm-checkout.php
│   ├── class-wcm-helpers.php              # send_event_to_server(), is_subscription_product() memoized
│   ├── class-wcm-health-monitor.php       # run_health_check() + heartbeat
│   ├── class-wcm-admin-dashboard.php
│   ├── class-wcm-subscription-manager-wps.php
│   ├── class-wcm-subscription-protector.php
│   ├── class-wcm-preorder.php
│   ├── class-wcm-auto-updater.php         # GitHub release poller (≤5s timeout)
│   └── class-wcm-file-analyzer.php
└── assets/
    ├── css/
    └── js/
        └── error-tracker.js               # Client-side tracker with 30s dedup
```

## Install Plugin

1. Download ZIP from [Releases](https://github.com/camster91/woo-comprehensive-monitor/releases/latest)
2. WordPress → Plugins → Add New → Upload → Activate
3. Auto-connects to `https://woo.ashbi.ca`

## Deploy Server

Server deploys automatically via Coolify when `master` is pushed.  
Coolify runs `docker build` from `Dockerfile` at repo root, which builds the React dashboard and copies everything into a Node 20 Alpine image.

### Server Environment Variables (set in Coolify)

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default `3000`) |
| `APP_FQDN` | Public URL e.g. `https://woo.ashbi.ca` (used for CORS) |
| `REQUIRE_AUTH` | `true` / `false` |
| `ALLOWED_EMAILS` | Comma-separated list for auth |
| `MAILGUN_API_KEY` | Mailgun sending key |
| `MAILGUN_DOMAIN` | Mailgun domain |
| `ALERT_EMAIL` | Recipient for alert emails |
| `DEEPSEEK_API_KEY` | DeepSeek AI for chat |
| `ALLOWED_ORIGINS` | Extra CORS origins (comma-separated) |

## Requirements

- WordPress 5.6+, WooCommerce 5.0+, PHP 7.4+
- Stripe for WooCommerce (disputes, recovery, pre-orders)
- Optional: WPSubscription, WooCommerce Subscriptions

## Cron Jobs (WordPress)

| Hook | Schedule | Purpose |
|------|----------|---------|
| `wcm_daily_health_check` | twicedaily | 15+ store health checks + heartbeat to server |
| `wcm_hourly_dispute_check` | hourly | Stripe dispute polling |
| `wcm_daily_log_cleanup` | daily | Prune old local error logs |
| `wcm_check_for_updates` | twicedaily | GitHub release auto-updater |

## Server Cron Jobs (Node.js)

| Schedule | Purpose |
|----------|---------|
| Every 6 hours | `checkAllStores()` — WooCommerce REST API health checks |
| Hourly | `checkSilentStores()` — alert if store last_seen > 26h |
| Daily 2:00am | SQLite backup (`VACUUM INTO /data/backups/`) |
| Daily 3:15am | Alert pruning (30d / 10k row cap) |

## Consolidated From

This repo replaces 5 separate repos:
- `woo-dispute-evidence` — dispute protection
- `Wp-Refund` — subscription discount recovery
- `preorder-wp` — pre-order system
- `subscription-price-diff-charger` — price diff charging
- `woo-monitor` — Node.js server
- `woo-monitor-plugin` — error tracking
