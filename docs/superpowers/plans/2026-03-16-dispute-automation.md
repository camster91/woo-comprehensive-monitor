# Dispute Automation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automate dispute tracking across all WooCommerce stores — auto-detect disputes via Stripe webhooks, store structured data, display in dashboard with filters/status/deadlines, and forward dispute lifecycle updates (opened/updated/won/lost).

**Architecture:** The WooCommerce plugin already captures disputes via Stripe webhooks and stores them locally. This plan adds: (1) a dedicated `disputes` table on the Node.js server, (2) enhanced plugin→server event payloads covering the full dispute lifecycle, (3) a Disputes dashboard page with filtering, detail view, and deadline tracking. All data originates from WooCommerce — no direct Stripe API calls from the server.

**Tech Stack:** PHP (WordPress plugin), Node.js/Express/SQLite (server), React/Tailwind (dashboard)

---

## File Map

### Server — New Files
- `server/migrations/003_disputes_table.sql` — disputes table schema
- `server/src/services/dispute-service.js` — CRUD for disputes table
- `server/src/routes/disputes.js` — REST endpoints for disputes
- `server/dashboard/src/pages/Disputes.jsx` — disputes dashboard page

### Server — Modified Files
- `server/src/routes/tracking.js` — handle dispute_created/updated/closed events, store in disputes table
- `server/src/app.js` — mount disputes routes
- `server/dashboard/src/App.jsx` — add Disputes route
- `server/dashboard/src/components/Layout.jsx` — add Disputes nav link

### Plugin — Modified Files
- `includes/class-wcm-dispute-manager.php` — send structured payloads for all dispute lifecycle events (created/updated/closed), fix field naming, include due_by deadline
- `woo-comprehensive-monitor.php` — bump version

---

## Chunk 1: Server Database & Service Layer

### Task 1: Create disputes table migration

**Files:**
- Create: `server/migrations/003_disputes_table.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
CREATE TABLE IF NOT EXISTS disputes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id TEXT REFERENCES stores(id) ON DELETE SET NULL,
  stripe_dispute_id TEXT NOT NULL,
  stripe_charge_id TEXT,
  order_id TEXT,
  customer_name TEXT,
  customer_email TEXT,
  amount REAL,
  currency TEXT DEFAULT 'USD',
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'needs_response',
  due_by TEXT,
  evidence_generated INTEGER DEFAULT 0,
  evidence_summary TEXT,
  store_name TEXT,
  store_url TEXT,
  products TEXT DEFAULT '[]',
  metadata TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_disputes_stripe_id ON disputes(stripe_dispute_id);
CREATE INDEX IF NOT EXISTS idx_disputes_store_id ON disputes(store_id);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes(status);
CREATE INDEX IF NOT EXISTS idx_disputes_due_by ON disputes(due_by);
CREATE INDEX IF NOT EXISTS idx_disputes_created_at ON disputes(created_at DESC);
```

- [ ] **Step 2: Verify migration runs on server start**

The existing `db.js` auto-runs all `*.sql` files in `migrations/` ordered by filename prefix. No code changes needed — just adding the file is sufficient.

- [ ] **Step 3: Commit**

```bash
git add server/migrations/003_disputes_table.sql
git commit -m "feat(server): add disputes table migration (003)"
```

---

### Task 2: Create dispute service

**Files:**
- Create: `server/src/services/dispute-service.js`

- [ ] **Step 1: Write the dispute service**

```javascript
const { run, get, all, insert } = require("../db");

function upsertDispute({
  stripeDisputeId, stripeChargeId, orderId,
  customerName, customerEmail, amount, currency,
  reason, status, dueBy, evidenceGenerated, evidenceSummary,
  storeId, storeName, storeUrl, products, metadata,
}) {
  const existing = get("SELECT id FROM disputes WHERE stripe_dispute_id = ?", [stripeDisputeId]);

  if (existing) {
    const fields = [];
    const params = [];
    if (status !== undefined)            { fields.push("status = ?");             params.push(status); }
    if (reason !== undefined)            { fields.push("reason = ?");             params.push(reason); }
    if (dueBy !== undefined)             { fields.push("due_by = ?");             params.push(dueBy); }
    if (evidenceGenerated !== undefined) { fields.push("evidence_generated = ?"); params.push(evidenceGenerated ? 1 : 0); }
    if (evidenceSummary !== undefined)   { fields.push("evidence_summary = ?");   params.push(evidenceSummary); }
    if (metadata !== undefined)          { fields.push("metadata = ?");           params.push(JSON.stringify(metadata)); }
    fields.push("updated_at = datetime('now')");
    if (fields.length > 1) {
      run(`UPDATE disputes SET ${fields.join(", ")} WHERE stripe_dispute_id = ?`, [...params, stripeDisputeId]);
    }
    return { action: "updated", id: existing.id };
  }

  const id = insert(
    `INSERT INTO disputes (stripe_dispute_id, stripe_charge_id, order_id,
      customer_name, customer_email, amount, currency, reason, status,
      due_by, evidence_generated, evidence_summary, store_id, store_name,
      store_url, products, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      stripeDisputeId, stripeChargeId || null, orderId || null,
      customerName || null, customerEmail || null, amount || null, currency || "USD",
      reason || null, status || "needs_response",
      dueBy || null, evidenceGenerated ? 1 : 0, evidenceSummary || null,
      storeId || null, storeName || null, storeUrl || null,
      JSON.stringify(products || []), JSON.stringify(metadata || {}),
    ]
  );
  return { action: "created", id };
}

function getDisputes({ storeId, status, limit = 50, offset = 0 } = {}) {
  const where = [];
  const params = [];
  if (storeId) { where.push("store_id = ?"); params.push(storeId); }
  if (status)  { where.push("status = ?");   params.push(status); }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const total = get(`SELECT COUNT(*) as c FROM disputes ${whereClause}`, params)?.c || 0;
  const disputes = all(
    `SELECT * FROM disputes ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  // Parse JSON fields
  const parsed = disputes.map(d => ({
    ...d,
    products: JSON.parse(d.products || "[]"),
    metadata: JSON.parse(d.metadata || "{}"),
    evidence_generated: !!d.evidence_generated,
  }));

  return { disputes: parsed, total };
}

function getDispute(id) {
  const d = get("SELECT * FROM disputes WHERE id = ?", [id]);
  if (!d) return null;
  return {
    ...d,
    products: JSON.parse(d.products || "[]"),
    metadata: JSON.parse(d.metadata || "{}"),
    evidence_generated: !!d.evidence_generated,
  };
}

function getDisputeByStripeId(stripeDisputeId) {
  const d = get("SELECT * FROM disputes WHERE stripe_dispute_id = ?", [stripeDisputeId]);
  if (!d) return null;
  return {
    ...d,
    products: JSON.parse(d.products || "[]"),
    metadata: JSON.parse(d.metadata || "{}"),
    evidence_generated: !!d.evidence_generated,
  };
}

function getDisputeStats() {
  const total = get("SELECT COUNT(*) as c FROM disputes")?.c || 0;
  const needsResponse = get("SELECT COUNT(*) as c FROM disputes WHERE status = 'needs_response'")?.c || 0;
  const won = get("SELECT COUNT(*) as c FROM disputes WHERE status = 'won'")?.c || 0;
  const lost = get("SELECT COUNT(*) as c FROM disputes WHERE status = 'lost'")?.c || 0;
  const totalAmount = get("SELECT COALESCE(SUM(amount), 0) as s FROM disputes")?.s || 0;
  const lostAmount = get("SELECT COALESCE(SUM(amount), 0) as s FROM disputes WHERE status = 'lost'")?.s || 0;
  return { total, needsResponse, won, lost, totalAmount, lostAmount };
}

function deleteDispute(id) {
  run("DELETE FROM disputes WHERE id = ?", [id]);
}

module.exports = {
  upsertDispute,
  getDisputes,
  getDispute,
  getDisputeByStripeId,
  getDisputeStats,
  deleteDispute,
};
```

- [ ] **Step 2: Commit**

```bash
git add server/src/services/dispute-service.js
git commit -m "feat(server): add dispute service with CRUD + stats"
```

---

### Task 3: Create dispute API routes

**Files:**
- Create: `server/src/routes/disputes.js`
- Modify: `server/src/app.js`

- [ ] **Step 1: Write the disputes router**

```javascript
const { Router } = require("express");
const disputeService = require("../services/dispute-service");

const router = Router();

router.get("/disputes", (req, res) => {
  const { storeId, status, limit, offset } = req.query;
  const result = disputeService.getDisputes({
    storeId: storeId || undefined,
    status: status || undefined,
    limit: parseInt(limit) || 50,
    offset: parseInt(offset) || 0,
  });
  res.json(result);
});

router.get("/disputes/stats", (req, res) => {
  res.json(disputeService.getDisputeStats());
});

router.get("/disputes/:id", (req, res) => {
  const dispute = disputeService.getDispute(parseInt(req.params.id));
  if (!dispute) return res.status(404).json({ error: "Dispute not found" });
  res.json(dispute);
});

router.delete("/disputes/:id", (req, res) => {
  disputeService.deleteDispute(parseInt(req.params.id));
  res.json({ success: true });
});

module.exports = router;
```

- [ ] **Step 2: Mount disputes routes in app.js**

In `server/src/app.js`, add after the other route `require()` lines:

```javascript
app.use("/api", require("./routes/disputes"));
```

- [ ] **Step 3: Commit**

```bash
git add server/src/routes/disputes.js server/src/app.js
git commit -m "feat(server): add disputes REST API endpoints"
```

---

### Task 4: Update tracking.js to store disputes structurally

**Files:**
- Modify: `server/src/routes/tracking.js`

- [ ] **Step 1: Add dispute_updated and dispute_closed to VALID_TYPES**

Add to the `VALID_TYPES` Set:
```javascript
"dispute_updated",
"dispute_closed",
```

- [ ] **Step 2: Import dispute service at top of file**

```javascript
const { upsertDispute } = require("../services/dispute-service");
```

- [ ] **Step 3: Update dispute_created handler**

Replace the existing `dispute_created` block with:

```javascript
if (type === "dispute_created") {
  // Store in dedicated disputes table
  upsertDispute({
    stripeDisputeId: req.body.dispute_id,
    stripeChargeId: req.body.charge_id,
    orderId: req.body.order_id?.toString(),
    customerName: req.body.customer_name,
    customerEmail: req.body.customer_email,
    amount: parseFloat(req.body.amount) || 0,
    currency: req.body.currency || "USD",
    reason: req.body.reason,
    status: "needs_response",
    dueBy: req.body.due_by || null,
    evidenceGenerated: req.body.evidence_generated || false,
    evidenceSummary: req.body.evidence_summary || null,
    storeId: storeId || null,
    storeName: req.body.store_name,
    storeUrl: req.body.store_url,
    products: req.body.products || [],
    metadata: req.body.metadata || {},
  });

  // Also create alert + email (existing behavior)
  const subject = `DISPUTE: ${req.body.dispute_id} on ${req.body.store_name}`;
  const message = [
    `New Stripe dispute detected!`,
    `Store: ${req.body.store_name}`,
    `Dispute ID: ${req.body.dispute_id}`,
    `Order ID: ${req.body.order_id}`,
    `Customer: ${req.body.customer_email}`,
    `Amount: ${req.body.amount} ${req.body.currency}`,
    `Reason: ${req.body.reason}`,
    `Due By: ${req.body.due_by || "Unknown"}`,
  ].join("\n");
  const dedupKey = `dispute_${req.body.dispute_id}`;
  if (!shouldDeduplicate(dedupKey)) {
    createAlert({ subject, message, storeId, severity: "critical", type: "dispute", dedupKey });
    queueAlertEmail(subject, message, storeId, "dispute");
  }
  return res.json({ success: true });
}
```

- [ ] **Step 4: Add dispute_updated handler**

```javascript
if (type === "dispute_updated") {
  upsertDispute({
    stripeDisputeId: req.body.dispute_id,
    status: req.body.status,
    reason: req.body.reason,
    evidenceGenerated: req.body.evidence_generated,
    evidenceSummary: req.body.evidence_summary,
    metadata: req.body.metadata,
  });
  return res.json({ success: true });
}
```

- [ ] **Step 5: Add dispute_closed handler**

```javascript
if (type === "dispute_closed") {
  const status = req.body.won ? "won" : "lost";
  upsertDispute({
    stripeDisputeId: req.body.dispute_id,
    status,
    metadata: req.body.metadata,
  });

  const subject = `DISPUTE ${status.toUpperCase()}: ${req.body.dispute_id} on ${req.body.store_name || "Unknown"}`;
  const message = `Dispute ${req.body.dispute_id} has been ${status}.\nAmount: ${req.body.amount || "?"} ${req.body.currency || ""}`;
  createAlert({ subject, message, storeId, severity: status === "won" ? "success" : "high", type: "dispute" });
  if (status === "lost") {
    queueAlertEmail(subject, message, storeId, "dispute");
  }
  return res.json({ success: true });
}
```

- [ ] **Step 6: Fix store lookup for disputes**

In the existing `findStoreByUrl(site)` call near the top of the handler, also check `req.body.store_url`:

```javascript
const siteObj = findStoreByUrl(site || req.body.store_url);
```

- [ ] **Step 7: Commit**

```bash
git add server/src/routes/tracking.js
git commit -m "feat(server): store disputes in dedicated table with lifecycle tracking"
```

---

## Chunk 2: Plugin — Enhanced Dispute Event Payloads

### Task 5: Enhance plugin dispute event payloads

**Files:**
- Modify: `includes/class-wcm-dispute-manager.php`

- [ ] **Step 1: Update send_dispute_alert() to send structured data**

Replace the existing `send_dispute_alert()` method body. The payload should include all fields the server needs:

```php
private function send_dispute_alert( $order, $dispute, $evidence = array() ) {
    $monitoring_server = get_option( 'wcm_monitoring_server' );
    if ( empty( $monitoring_server ) ) return;

    // Collect product info
    $products = array();
    foreach ( $order->get_items() as $item ) {
        $products[] = array(
            'name' => $item->get_name(),
            'qty'  => $item->get_quantity(),
            'total' => $item->get_total(),
        );
    }

    $due_by = null;
    if ( isset( $dispute->evidence_details->due_by ) ) {
        $due_by = gmdate( 'Y-m-d H:i:s', $dispute->evidence_details->due_by );
    }

    $payload = array(
        'type'               => 'dispute_created',
        'site'               => home_url(),
        'store_url'          => home_url(),
        'store_name'         => get_bloginfo( 'name' ),
        'store_id'           => get_option( 'wcm_store_id', '' ),
        'dispute_id'         => $dispute->id,
        'charge_id'          => $dispute->charge,
        'order_id'           => $order->get_id(),
        'customer_name'      => $order->get_formatted_billing_full_name(),
        'customer_email'     => $order->get_billing_email(),
        'amount'             => $dispute->amount / 100,
        'currency'           => strtoupper( $dispute->currency ),
        'reason'             => $dispute->reason,
        'due_by'             => $due_by,
        'evidence_generated' => ! empty( $evidence ),
        'evidence_summary'   => isset( $evidence['rebuttal_text'] ) ? $evidence['rebuttal_text'] : '',
        'products'           => $products,
        'timestamp'          => current_time( 'mysql' ),
    );

    wp_remote_post( $monitoring_server, array(
        'body'     => wp_json_encode( $payload ),
        'headers'  => array( 'Content-Type' => 'application/json' ),
        'timeout'  => 5,
        'blocking' => false,
    ) );
}
```

- [ ] **Step 2: Add send methods for dispute_updated and dispute_closed**

Add after `send_dispute_alert()`:

```php
private function send_dispute_update( $dispute, $type = 'dispute_updated' ) {
    $monitoring_server = get_option( 'wcm_monitoring_server' );
    if ( empty( $monitoring_server ) ) return;

    $payload = array(
        'type'               => $type,
        'site'               => home_url(),
        'store_url'          => home_url(),
        'store_name'         => get_bloginfo( 'name' ),
        'dispute_id'         => $dispute->id,
        'status'             => $dispute->status,
        'reason'             => $dispute->reason,
        'amount'             => isset( $dispute->amount ) ? $dispute->amount / 100 : null,
        'currency'           => isset( $dispute->currency ) ? strtoupper( $dispute->currency ) : null,
        'won'                => $dispute->status === 'won',
        'evidence_generated' => isset( $dispute->evidence_details->has_evidence ) ? $dispute->evidence_details->has_evidence : false,
        'timestamp'          => current_time( 'mysql' ),
    );

    wp_remote_post( $monitoring_server, array(
        'body'     => wp_json_encode( $payload ),
        'headers'  => array( 'Content-Type' => 'application/json' ),
        'timeout'  => 5,
        'blocking' => false,
    ) );
}
```

- [ ] **Step 3: Wire handle_updated_dispute() to send events**

In `handle_updated_dispute()`, after the existing DB update logic, add:

```php
$this->send_dispute_update( $dispute, 'dispute_updated' );
```

- [ ] **Step 4: Wire handle_closed_dispute() to send events**

In `handle_closed_dispute()`, after the existing DB update and order note logic, add:

```php
$this->send_dispute_update( $dispute, 'dispute_closed' );
```

- [ ] **Step 5: Commit**

```bash
git add includes/class-wcm-dispute-manager.php
git commit -m "feat(plugin): send structured dispute lifecycle events to monitoring server"
```

---

## Chunk 3: Dashboard — Disputes Page

### Task 6: Create Disputes dashboard page

**Files:**
- Create: `server/dashboard/src/pages/Disputes.jsx`

- [ ] **Step 1: Build the Disputes page component**

The page should follow the Alerts.jsx pattern with these sections:
- Stats bar: total disputes, needs response (with count badge), won, lost, total $ at risk
- Filters: store dropdown, status dropdown (needs_response / under_review / won / lost / all)
- Table rows with columns: Store, Customer, Amount, Reason, Status badge, Due By (with countdown/overdue highlighting), Date
- Expandable row detail: order ID, dispute ID, products list, evidence summary, metadata
- Load more pagination

Key UI details:
- Status badges: needs_response=red, under_review=yellow, won=green, lost=red
- Due By column: red text + "OVERDUE" badge if past due, yellow if within 7 days
- Amount column: formatted as currency with currency code
- Reason column: humanized (e.g. "fraudulent" → "Fraudulent", "subscription_canceled" → "Subscription Cancelled")

Full component code (~250 lines of JSX following existing patterns from Alerts.jsx and Stores.jsx):

```jsx
import { useEffect, useState } from "react";
import { api, apiDelete } from "../api/client";
import { useToast } from "../components/Toast";
import { timeAgo } from "../utils/time";
import {
  Shield, AlertTriangle, CheckCircle, XCircle, Clock,
  ChevronDown, ChevronRight, Trash2, Filter,
} from "lucide-react";

const REASONS = {
  fraudulent: "Fraudulent",
  product_not_received: "Product Not Received",
  duplicate: "Duplicate",
  subscription_canceled: "Subscription Cancelled",
  unrecognized: "Unrecognized",
  credit_not_processed: "Credit Not Processed",
  general: "General",
  product_unacceptable: "Defective / Unacceptable",
};

const STATUS_STYLES = {
  needs_response: { bg: "bg-red-50", text: "text-red-700", label: "Needs Response" },
  warning_needs_response: { bg: "bg-red-50", text: "text-red-700", label: "Needs Response" },
  under_review: { bg: "bg-yellow-50", text: "text-yellow-700", label: "Under Review" },
  won: { bg: "bg-green-50", text: "text-green-700", label: "Won" },
  lost: { bg: "bg-red-50", text: "text-red-700", label: "Lost" },
  charge_refunded: { bg: "bg-gray-50", text: "text-gray-600", label: "Refunded" },
};

export default function Disputes() {
  const [data, setData] = useState({ disputes: [], total: 0 });
  const [stats, setStats] = useState(null);
  const [stores, setStores] = useState([]);
  const [filters, setFilters] = useState({ storeId: "", status: "" });
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(new Set());
  const toast = useToast();

  const fetchDisputes = (offset = 0, append = false) => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "50", offset: String(offset) });
    if (filters.storeId) params.set("storeId", filters.storeId);
    if (filters.status) params.set("status", filters.status);
    api(`/api/disputes?${params}`).then((res) => {
      setData((prev) => append
        ? { disputes: [...prev.disputes, ...res.disputes], total: res.total }
        : res
      );
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchDisputes();
    api("/api/disputes/stats").then(setStats);
    api("/api/stores").then((r) => setStores(r.stores || []));
  }, []);

  useEffect(() => { fetchDisputes(); }, [filters]);

  const toggle = (id) => setExpanded((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const dueBadge = (dueBy) => {
    if (!dueBy) return null;
    const due = new Date(dueBy.endsWith("Z") ? dueBy : dueBy + "Z");
    const daysLeft = Math.ceil((due - Date.now()) / 86400000);
    if (daysLeft < 0) return <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-lg">OVERDUE</span>;
    if (daysLeft <= 7) return <span className="text-xs font-medium text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded-lg">{daysLeft}d left</span>;
    return <span className="text-xs text-slate-500">{due.toLocaleDateString()}</span>;
  };

  return (
    <div className="space-y-5">
      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="Total" value={stats.total} icon={<Shield size={14} />} />
          <StatCard label="Needs Response" value={stats.needsResponse} icon={<AlertTriangle size={14} />} color="red" />
          <StatCard label="Won" value={stats.won} icon={<CheckCircle size={14} />} color="green" />
          <StatCard label="Lost" value={stats.lost} icon={<XCircle size={14} />} color="red" />
          <StatCard label="$ at Risk" value={`$${stats.totalAmount.toFixed(2)}`} icon={<Clock size={14} />} color="yellow" />
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 items-center">
        <Filter size={14} className="text-slate-400" />
        <select value={filters.storeId} onChange={(e) => setFilters((f) => ({ ...f, storeId: e.target.value }))}
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5">
          <option value="">All Stores</option>
          {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5">
          <option value="">All Statuses</option>
          <option value="needs_response">Needs Response</option>
          <option value="under_review">Under Review</option>
          <option value="won">Won</option>
          <option value="lost">Lost</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="grid grid-cols-[1fr_1fr_80px_1fr_100px_100px_80px] gap-2 px-4 py-2.5 bg-slate-50 border-b text-xs font-semibold text-slate-500 uppercase tracking-wide">
          <span>Store</span><span>Customer</span><span>Amount</span><span>Reason</span><span>Status</span><span>Due By</span><span></span>
        </div>

        {data.disputes.map((d) => {
          const isOpen = expanded.has(d.id);
          const st = STATUS_STYLES[d.status] || STATUS_STYLES.needs_response;
          return (
            <div key={d.id} className="border-b border-gray-50 last:border-0">
              <div onClick={() => toggle(d.id)}
                className="grid grid-cols-[1fr_1fr_80px_1fr_100px_100px_80px] gap-2 px-4 py-3 items-center cursor-pointer hover:bg-slate-50 transition-colors text-sm">
                <span className="font-medium text-slate-700 truncate">{d.store_name || "Unknown"}</span>
                <span className="text-slate-600 truncate">{d.customer_name || d.customer_email || "—"}</span>
                <span className="font-medium text-slate-700">${d.amount?.toFixed(2)}</span>
                <span className="text-slate-600">{REASONS[d.reason] || d.reason || "—"}</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-lg inline-block w-fit ${st.bg} ${st.text}`}>{st.label}</span>
                {dueBadge(d.due_by)}
                <span>{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
              </div>

              {isOpen && (
                <div className="px-6 pb-4 bg-slate-50/50 space-y-2 text-sm">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Detail label="Order #" value={d.order_id} />
                    <Detail label="Dispute ID" value={d.stripe_dispute_id} mono />
                    <Detail label="Currency" value={d.currency} />
                    <Detail label="Created" value={d.created_at ? timeAgo(d.created_at) : "—"} />
                  </div>
                  {d.products?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 mb-1">Products</p>
                      {d.products.map((p, i) => (
                        <p key={i} className="text-xs text-slate-600">{p.qty}x {p.name} — ${parseFloat(p.total).toFixed(2)}</p>
                      ))}
                    </div>
                  )}
                  {d.evidence_summary && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 mb-1">Evidence Summary</p>
                      <p className="text-xs text-slate-600 whitespace-pre-wrap">{d.evidence_summary}</p>
                    </div>
                  )}
                  <button onClick={(e) => { e.stopPropagation(); apiDelete(`/api/disputes/${d.id}`).then(() => { toast("Dispute removed"); fetchDisputes(); }); }}
                    className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 mt-2">
                    <Trash2 size={12} /> Remove
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {data.disputes.length === 0 && !loading && (
          <p className="text-center text-sm text-slate-400 py-8">No disputes found</p>
        )}
      </div>

      {/* Load more */}
      {data.disputes.length < data.total && (
        <button onClick={() => fetchDisputes(data.disputes.length, true)}
          className="w-full py-2 text-sm text-slate-500 hover:text-slate-700 border border-slate-200 rounded-xl">
          Load more ({data.total - data.disputes.length} remaining)
        </button>
      )}
    </div>
  );
}

function StatCard({ label, value, icon, color }) {
  const colors = { red: "text-red-600", green: "text-green-600", yellow: "text-yellow-600" };
  return (
    <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
      <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">{icon}{label}</div>
      <p className={`text-xl font-bold ${colors[color] || "text-slate-700"}`}>{value}</p>
    </div>
  );
}

function Detail({ label, value, mono }) {
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`text-sm text-slate-700 ${mono ? "font-mono text-xs" : ""}`}>{value || "—"}</p>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add server/dashboard/src/pages/Disputes.jsx
git commit -m "feat(dashboard): add Disputes page with stats, filters, and detail view"
```

---

### Task 7: Wire Disputes page into dashboard navigation

**Files:**
- Modify: `server/dashboard/src/App.jsx`
- Modify: `server/dashboard/src/components/Layout.jsx`

- [ ] **Step 1: Add route in App.jsx**

Import `Disputes` and add `<Route>`:

```jsx
import Disputes from "./pages/Disputes";
```

Add route alongside existing ones:
```jsx
<Route path="dashboard/disputes" element={<Disputes />} />
```

- [ ] **Step 2: Add nav link in Layout.jsx**

Import `Shield` icon from lucide-react and add nav entry after Alerts:

```jsx
{ to: "/dashboard/disputes", label: "Disputes", icon: Shield },
```

- [ ] **Step 3: Commit**

```bash
git add server/dashboard/src/App.jsx server/dashboard/src/components/Layout.jsx
git commit -m "feat(dashboard): add Disputes to navigation and routing"
```

---

## Chunk 4: Build, Deploy, Version Bump

### Task 8: Build dashboard, bump versions, deploy

- [ ] **Step 1: Bump plugin version to 4.5.9**

In `woo-comprehensive-monitor.php`, update both `Version:` header and `WCM_VERSION` constant to `4.5.9`.

- [ ] **Step 2: Build dashboard**

```bash
cd server/dashboard && npm run build
```

- [ ] **Step 3: Build plugin ZIP**

```bash
cd /path/to/repo
powershell -Command "Compress-Archive -Path 'woo-comprehensive-monitor.php','uninstall.php','admin','includes','assets' -DestinationPath 'woo-comprehensive-monitor-v4.5.9.zip' -Force"
```

- [ ] **Step 4: Final commit and push**

```bash
git add -A
git commit -m "feat: dispute automation v4.5.9 — dedicated storage, lifecycle tracking, dashboard page"
git push origin master
```

- [ ] **Step 5: Create GitHub release**

```bash
gh release create v4.5.9 woo-comprehensive-monitor-v4.5.9.zip --title "v4.5.9 — Dispute Automation" --notes "..."
```

- [ ] **Step 6: Trigger Coolify deploy**

Use the temporary API token pattern to trigger a redeploy via the Coolify API.

- [ ] **Step 7: Verify**

- Navigate to `woo.ashbi.ca/dashboard/disputes` — should show empty state
- Check `GET /api/disputes/stats` returns `{ total: 0, needsResponse: 0, ... }`
- Check `GET /api/health` returns 200

---

## Summary

| Task | Component | What it does |
|------|-----------|-------------|
| 1 | Server DB | `disputes` table with all structured fields |
| 2 | Server service | CRUD + stats queries for disputes |
| 3 | Server routes | REST API for disputes list/detail/delete/stats |
| 4 | Server tracking | Store dispute events in new table, fix store linkage, handle lifecycle |
| 5 | Plugin | Send structured payloads with due_by, products, evidence; forward updates/closes |
| 6 | Dashboard page | Stats bar, filterable table, expandable detail, deadline badges |
| 7 | Dashboard nav | Route + nav link for Disputes |
| 8 | Build & deploy | Version bump, ZIP, release, Coolify deploy |
