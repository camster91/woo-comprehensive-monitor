# WooCommerce Comprehensive Monitor & Dispute Protection

All-in-one WooCommerce monitoring plugin: error tracking, dispute protection with evidence generation, subscription acknowledgments, and health monitoring. Auto-connects to a central Node.js monitoring server on activation.

## Features

### 🚨 Error Tracking
- JavaScript error tracking on WooCommerce pages (checkout, cart, product)
- AJAX add-to-cart and checkout failure detection
- Checkout form validation and payment gateway error tracking
- Real-time error reporting to central monitoring server

### 🛡️ Dispute Protection (from woo-dispute-evidence)
- **Subscription Acknowledgment Checkbox** at checkout — records customer agreement to recurring charges with IP, timestamp, and user agent
- **Automatic Evidence Generation** — creates professional HTML evidence documents when Stripe disputes are detected
- **Stripe Webhook Integration** — real-time dispute detection via `charge.dispute.created/updated/closed`
- **Manual Evidence Generation** — create evidence for any order from the admin dashboard
- **Smart Rebuttal Text** — auto-generated dispute rebuttal text for Stripe submissions
- **Dispute Management Dashboard** — view, filter, and manage all disputes in one place
- **Multi-plugin subscription detection** — WooCommerce Subscriptions, WPSubscription Pro, YITH, and more

### 🏥 Health Monitoring
- 10+ health checks: WooCommerce status, Stripe gateway, Action Scheduler, SSL, database, server resources, API connectivity, shipping/tax, and more
- Health score (0–100) with detailed breakdown
- Scheduled checks every hour with critical alerts
- WPSubscription integration for subscription health

### 📊 Admin Dashboard
- Unified dashboard with stats cards
- Error logs with clear functionality
- Dispute management with status tracking
- Subscription acknowledgment records
- Health check history and manual checks

### 🔄 Auto-Connect
- Zero configuration — plugin auto-connects to monitoring server on activation
- Unique store ID generated automatically
- Works with ManageWP batch installation

## Requirements

- WordPress 5.6+
- WooCommerce 5.0+
- PHP 7.4+

### Optional
- [WPSubscription](https://wpsubscription.com/) — for subscription monitoring
- Stripe for WooCommerce — for dispute protection
- [WooCommerce Monitor Server](https://github.com/camster91/woo-monitor) — central monitoring

## Installation

1. Download the latest release ZIP
2. WordPress Admin → Plugins → Add New → Upload Plugin
3. Activate — plugin auto-connects to `https://woo.ashbi.ca/api/track-woo-error`
4. Go to **WC Monitor → Settings** to customize

## Stripe Webhook Setup

1. Stripe Dashboard → Developers → Webhooks → Add endpoint
2. URL: `https://your-site.com/wp-json/wcm/v1/stripe-webhook`
3. Events: `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`

## Plugin Structure

```
woo-comprehensive-monitor/
├── woo-comprehensive-monitor.php       # Main plugin file
├── admin/settings.php                  # Settings page
├── includes/
│   ├── class-wcm-helpers.php           # Subscription detection, acknowledgment storage
│   ├── class-wcm-checkout.php          # Checkout acknowledgment checkbox
│   ├── class-wcm-evidence-generator.php # HTML evidence document generation
│   ├── class-wcm-dispute-manager.php   # Stripe dispute handling
│   ├── class-wcm-error-tracker.php     # Frontend error tracking
│   ├── class-wcm-health-monitor.php    # Health checks
│   ├── class-wcm-admin-dashboard.php   # Admin UI
│   └── class-wcm-subscription-manager-wps.php # WPSubscription integration
├── assets/
│   ├── css/admin.css
│   └── js/admin.js, error-tracker.js
└── README.md
```

## Monitoring Server

This plugin is designed to work with the [WooCommerce Monitor Server](https://github.com/camster91/woo-monitor). The server receives error reports, dispute alerts, and health data from all your stores.

## Changelog

### v3.1.0
- **Merged** all features from `woo-dispute-evidence` plugin (subscription acknowledgments, evidence generation, Stripe webhook integration, dispute dashboard)
- **Merged** error tracking from `woo-monitor-plugin`
- **Fixed** truncated PHP class files causing fatal activation errors
- **Added** `class-wcm-helpers.php` with multi-plugin subscription detection
- **Added** `class-wcm-checkout.php` for checkout acknowledgment checkbox
- **Added** `class-wcm-evidence-generator.php` for HTML evidence documents
- **Added** acknowledgments admin page
- **Added** manual evidence generation from disputes page
- **Added** dispute status management modal
- **Cleaned up** redundant .md files and test scripts
