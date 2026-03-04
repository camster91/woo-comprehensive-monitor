# WooCommerce Comprehensive Monitor

**One repo — everything you need.** WordPress plugin + Node.js monitoring server.

- **Plugin** (v4.1.0) — install on your WooCommerce stores → [Download ZIP](https://github.com/camster91/woo-comprehensive-monitor/releases/latest)
- **Server** — deployed to `https://woo.ashbi.ca` via Coolify (auto-deploys from `server/`)

## Plugin Features

| Feature | Description |
|---------|-------------|
| 🚨 Error Tracking | JS, AJAX, checkout error tracking → sent to central server |
| 🛡️ Dispute Protection | Stripe webhook integration, auto evidence generation, checkout acknowledgments |
| 💰 Discount Recovery | Charges customers who cancel subscriptions early the price difference |
| 💱 Price Diff Charger | Convert subscription→one-time purchase, charge the difference (any gateway) |
| 📦 Pre-Orders | Backorders = pre-orders. Card saved at checkout, charged on ship |
| 🏥 Health Monitoring | 10+ checks (WooCommerce, Stripe, SSL, DB, server resources) |
| 📊 Admin Dashboard | 8 pages: Dashboard, Errors, Disputes, Acknowledgments, Recovery, Pre-Orders, Health, Settings |

## Server Features

| Feature | Description |
|---------|-------------|
| 📡 Multi-Store Monitoring | Receives errors/alerts from all stores |
| 🏪 Store Management | Add/remove/update stores via dashboard |
| 📧 Email Alerts | Mailgun alerts for critical issues |
| 🔍 Deep Health Checks | Periodic health checks via WooCommerce REST API |
| 📊 Dashboard | Web UI at `https://woo.ashbi.ca` |

## Repo Structure

```
woo-comprehensive-monitor/
├── Dockerfile                             # Coolify deploys the server from here
├── server/                                # Node.js monitoring server
│   ├── server.js
│   ├── dashboard-enhanced.html
│   ├── package.json
│   └── ...
├── woo-comprehensive-monitor.php          # WordPress plugin main file
├── uninstall.php
├── admin/settings.php                     # 9 settings tabs
├── includes/
│   ├── class-wcm-error-tracker.php
│   ├── class-wcm-dispute-manager.php
│   ├── class-wcm-evidence-generator.php
│   ├── class-wcm-checkout.php
│   ├── class-wcm-helpers.php
│   ├── class-wcm-health-monitor.php
│   ├── class-wcm-admin-dashboard.php
│   ├── class-wcm-subscription-manager-wps.php
│   ├── class-wcm-refund-recovery.php
│   ├── class-wcm-preorder.php
│   └── class-wcm-price-diff-charger.php
└── assets/css/, assets/js/
```

## Install Plugin

1. Download ZIP from [Releases](https://github.com/camster91/woo-comprehensive-monitor/releases/latest)
2. WordPress → Plugins → Add New → Upload → Activate
3. Auto-connects to `https://woo.ashbi.ca`

## Deploy Server

Server deploys automatically via Coolify from the `Dockerfile` at repo root, which builds from `server/`.

## Requirements

- WordPress 5.6+, WooCommerce 5.0+, PHP 7.4+
- Stripe for WooCommerce (disputes, recovery, pre-orders)
- Optional: WPSubscription, WooCommerce Subscriptions

## Consolidated From

This repo replaces 5 separate repos:
- `woo-dispute-evidence` — dispute protection
- `Wp-Refund` — subscription discount recovery
- `preorder-wp` — pre-order system
- `subscription-price-diff-charger` — price diff charging
- `woo-monitor` — Node.js server
- `woo-monitor-plugin` — error tracking
