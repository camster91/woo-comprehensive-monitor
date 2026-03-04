# WooCommerce Comprehensive Monitor

All-in-one WooCommerce plugin: error tracking, dispute protection, subscription discount recovery, pre-order system, and health monitoring. Auto-connects to a central Node.js monitoring server on activation.

## Features

### 🚨 Error Tracking
- JavaScript, AJAX, and checkout error tracking on WooCommerce pages
- Real-time error reporting to central monitoring server

### 🛡️ Dispute Protection
- Subscription acknowledgment checkbox at checkout (records IP, timestamp, user agent)
- Automatic HTML evidence generation when Stripe disputes are detected
- Stripe webhook integration for real-time dispute detection
- Manual evidence generation from admin dashboard
- Auto-generated rebuttal text for Stripe submissions
- Dispute management dashboard with status tracking

### 💰 Subscription Discount Recovery *(from Wp-Refund)*
- **Auto-charges customers who cancel subscriptions early** the difference between regular and subscription pricing
- Configurable minimum orders before free cancellation (default: 2)
- Grace period setting (cancel free within X days)
- Automatic or manual charge method (Stripe saved payment)
- Recovery log with stats (total recovered, pending, failed)
- Customer My Account page showing recovery charges
- Cancel confirmation dialog with recovery warning
- Exempt user roles (e.g., don't charge admins)
- Email notifications for customer and admin

### 📦 Pre-Order System *(from preorder-wp)*
- **Backorders = Pre-Orders** — any product with "Allow Backorders" becomes a pre-order
- Stripe SetupIntent saves card at checkout (no charge)
- **Charge on Ship** — card charged automatically when order status changes to Completed
- Custom order statuses: `Pre-Ordered`, `Pre-Order Payment Failed`
- "Ship & Charge" button on order list for quick processing
- Automatic retry after 24 hours if charge fails
- Mixed cart prevention (can't mix pre-order + in-stock)
- Product editor fields: availability date, custom button text, pre-order message
- Pre-order label in cart and checkout notice

### 🏥 Health Monitoring
- 10+ health checks: WooCommerce, Stripe, Action Scheduler, SSL, database, server resources, API, shipping/tax
- Health score (0–100) with detailed breakdown
- Scheduled checks every hour with critical alerts

### 📊 Admin Dashboard
- Stats cards: health score, errors, disputes, acknowledgments, recovered amount, pre-orders
- Error logs, dispute management, acknowledgment records
- Recovery log with totals and per-charge detail
- Pre-orders list with "Ship & Charge" bulk action
- 8 settings tabs: General, Error Tracking, Dispute Protection, Health, Recovery, Pre-Orders, Alerts, Advanced

## Requirements

- WordPress 5.6+
- WooCommerce 5.0+ (HPOS compatible)
- PHP 7.4+
- Stripe for WooCommerce (for disputes, recovery charges, and pre-orders)

### Optional
- [WPSubscription](https://wpsubscription.com/) — subscription monitoring
- [WooCommerce Monitor Server](https://github.com/camster91/woo-monitor) — central monitoring

## Installation

1. Download the latest release ZIP from [Releases](https://github.com/camster91/woo-comprehensive-monitor/releases)
2. WordPress Admin → Plugins → Add New → Upload Plugin
3. Activate — auto-connects to `https://woo.ashbi.ca`

## Stripe Webhook Setup

1. Stripe Dashboard → Developers → Webhooks → Add endpoint
2. URL: `https://your-site.com/wp-json/wcm/v1/stripe-webhook`
3. Events: `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`

## Plugin Structure

```
woo-comprehensive-monitor/
├── woo-comprehensive-monitor.php          # Main plugin file + activation
├── uninstall.php                          # Clean removal of all data
├── admin/settings.php                     # 8-tab settings page
├── includes/
│   ├── class-wcm-helpers.php              # Multi-plugin subscription detection
│   ├── class-wcm-checkout.php             # Checkout acknowledgment checkbox
│   ├── class-wcm-evidence-generator.php   # HTML evidence documents
│   ├── class-wcm-dispute-manager.php      # Stripe dispute handling
│   ├── class-wcm-error-tracker.php        # Frontend error tracking
│   ├── class-wcm-health-monitor.php       # Health checks (10+)
│   ├── class-wcm-admin-dashboard.php      # Admin UI (7 pages)
│   ├── class-wcm-subscription-manager-wps.php  # WPSubscription integration
│   ├── class-wcm-refund-recovery.php      # Subscription discount recovery
│   └── class-wcm-preorder.php             # Pre-order system
├── assets/
│   ├── css/admin.css, preorder-frontend.css, my-account.css
│   └── js/admin.js, error-tracker.js
└── README.md
```

## Repos Consolidated

This plugin merges features from 3 separate plugins:
- **woo-dispute-evidence** → dispute protection, evidence generation, checkout acknowledgments
- **Wp-Refund** → subscription discount recovery, cancellation handling
- **preorder-wp** → pre-order system, charge-on-ship, custom order statuses

## Changelog

### v4.0.0
- **Merged** subscription discount recovery from `Wp-Refund` (early cancellation charges, recovery log, My Account page, admin dashboard)
- **Merged** pre-order system from `preorder-wp` (backorder→pre-order, Stripe SetupIntent, charge-on-ship, custom statuses, retry logic)
- **Added** Recovery Log admin page with stats
- **Added** Pre-Orders admin page with Ship & Charge actions
- **Added** Settings tabs: Discount Recovery, Pre-Orders
- **Added** `uninstall.php` for clean data removal
- **Added** HPOS compatibility declaration
- **Added** My Account "Recovery Charges" page for customers

### v3.1.0
- Merged dispute evidence, fixed truncated PHP files, added checkout acknowledgments
