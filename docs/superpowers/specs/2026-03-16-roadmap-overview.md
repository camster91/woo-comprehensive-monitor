# WooCommerce Monitor — Feature Roadmap

## Phase 1: Revenue & Orders Dashboard
- Server-side polling via WooCommerce REST API (every 30 min, no plugin overhead)
- Revenue overview: today/week/month across all stores, trend charts
- Store detail: revenue, orders, subscriptions, MRR, churn, top products
- Cross-store comparison table with sortable columns
- New SQLite tables: store_revenue, store_subscriptions, store_products, store_orders_recent

## Phase 2: Dispute Command Center Upgrade
- Auto-submit evidence to Stripe API (not just generate — actually submit)
- Win/loss rate analytics per store, per reason
- Deadline calendar view with countdown
- One-click evidence regeneration from dashboard
- Suggested response templates based on dispute reason

## Phase 3: UX/UI Overhaul
- Dark mode
- Mobile responsive dashboard
- Real-time WebSocket updates (replace polling)
- Better charts with Chart.js
- Toast notifications for critical events

## Phase 4: Uptime & Performance Monitoring
- Page speed tracking (TTFB, LCP) per store
- Uptime checks every 5 min with downtime alerts
- SSL certificate expiry warnings
- WP/WC/plugin version tracking with update alerts

## Phase 5: Client Portal
- Per-store login for influencers/brands
- White-label option (custom branding)
- Weekly automated email digest per client

## Phase 6: Inventory & Product Alerts
- Low stock warnings across all stores
- Out-of-stock product alerts
- Price change tracking

---

## Architecture Principles
- Plugin stays lightweight — no new WordPress overhead
- Server does all heavy computation
- All WooCommerce data pulled via existing REST API credentials
- Primary users: Cameron (owner), Natalie (ops), then influencer clients
