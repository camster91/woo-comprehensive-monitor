# Dispute Command Center Upgrade Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add auto-submit evidence after 24h delay with hold/release, win/loss analytics (per-store, per-reason, over-time), and a deadline timeline with countdown badges to the existing dispute management system.

**Architecture:** New DB columns on existing disputes table for auto-submit timer and hold state. New cron job checks every 15 minutes for disputes ready to auto-submit. New analytics queries aggregate disputes by store/reason/time. Deadline timeline renders above the disputes table as a grouped urgency list. Disputes page gets a tab system (Active Disputes / Analytics).

**Tech Stack:** Node.js/Express 5, better-sqlite3, axios, node-cron, React 19, Tailwind 4, Chart.js/react-chartjs-2, Lucide React.

**Spec:** `docs/superpowers/specs/2026-03-17-dispute-command-center-upgrade-design.md`

---

## Chunk 1: Auto-Submit Backend

### Task 1: Database Migration (005)

**Files:**
- Create: `server/migrations/005_dispute_auto_submit.sql`
- Modify: `server/src/db.js:58-60` (add migration 005 to versionedMigrations)

- [ ] **Step 1: Create migration file**

```sql
-- server/migrations/005_dispute_auto_submit.sql
ALTER TABLE disputes ADD COLUMN auto_submit_at TEXT;
ALTER TABLE disputes ADD COLUMN hold INTEGER DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_disputes_auto_submit ON disputes(auto_submit_at) WHERE hold = 0;
```

- [ ] **Step 2: Register in db.js**

Add to `versionedMigrations` array after the `004` entry:

```javascript
{ version: "005", file: "005_dispute_auto_submit.sql" },
```

- [ ] **Step 3: Verify**

Run: `cd /c/Users/camst/woo-comprehensive-monitor/server && node -e "require('./src/db').initDB(); console.log('OK')"`
Expected: `[DB] Migration 005 applied` then `OK`

- [ ] **Step 4: Commit**

```bash
git add server/migrations/005_dispute_auto_submit.sql server/src/db.js
git commit -m "feat: add auto_submit_at and hold columns to disputes (migration 005)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Dispute Service — Auto-Submit + Analytics + Deadlines Functions

**Files:**
- Modify: `server/src/services/dispute-service.js` (add 5 new functions, update exports)

- [ ] **Step 1: Add new functions to dispute-service.js**

Add before the `module.exports` block:

```javascript
/**
 * Get disputes due for auto-submission.
 * Returns disputes with store credentials for the submission API call.
 */
function getDueForAutoSubmit() {
  return all(
    `SELECT d.*, s.consumer_key, s.consumer_secret, s.url as store_api_url
     FROM disputes d
     LEFT JOIN stores s ON d.store_id = s.id
     WHERE d.auto_submit_at <= datetime('now')
       AND d.hold = 0
       AND d.status IN ('needs_response', 'warning_needs_response')
       AND d.auto_submit_at IS NOT NULL`,
    []
  ).map(d => ({
    ...d,
    products: JSON.parse(d.products || "[]"),
    metadata: JSON.parse(d.metadata || "{}"),
    evidence_generated: !!d.evidence_generated,
  }));
}

/**
 * Set hold state on a dispute.
 * hold=1: pause auto-submit, clear timer.
 * hold=0: resume, reset timer to 24h from now.
 */
function setHold(id, hold) {
  if (hold) {
    run("UPDATE disputes SET hold = 1, auto_submit_at = NULL, updated_at = datetime('now') WHERE id = ?", [id]);
  } else {
    run("UPDATE disputes SET hold = 0, auto_submit_at = datetime('now', '+24 hours'), updated_at = datetime('now') WHERE id = ?", [id]);
  }
}

/**
 * Set auto-submit timer by stripe_dispute_id.
 */
function setAutoSubmitAt(stripeDisputeId, timestamp) {
  run("UPDATE disputes SET auto_submit_at = ?, updated_at = datetime('now') WHERE stripe_dispute_id = ?", [timestamp, stripeDisputeId]);
}

/**
 * Clear auto-submit timer (after manual submit or successful auto-submit).
 */
function clearAutoSubmit(id) {
  run("UPDATE disputes SET auto_submit_at = NULL, hold = 0, updated_at = datetime('now') WHERE id = ?", [id]);
}

/**
 * Get dispute analytics for a period.
 */
function getDisputeAnalytics(period) {
  const startDate = periodToStartDate(period);
  const dateFilter = startDate ? "WHERE created_at >= ?" : "";
  const params = startDate ? [startDate] : [];

  const summary = get(
    `SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) as won,
      SUM(CASE WHEN status = 'lost' THEN 1 ELSE 0 END) as lost,
      SUM(CASE WHEN status IN ('needs_response', 'warning_needs_response') THEN 1 ELSE 0 END) as pending,
      COALESCE(SUM(amount), 0) as totalAmount,
      COALESCE(SUM(CASE WHEN status = 'lost' THEN amount ELSE 0 END), 0) as lostAmount
     FROM disputes ${dateFilter}`,
    params
  );
  const winLossTotal = (summary.won || 0) + (summary.lost || 0);
  summary.winRate = winLossTotal > 0 ? parseFloat(((summary.won / winLossTotal) * 100).toFixed(1)) : null;

  const byStore = all(
    `SELECT
      store_name,
      COUNT(*) as total,
      SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) as won,
      SUM(CASE WHEN status = 'lost' THEN 1 ELSE 0 END) as lost,
      SUM(CASE WHEN status IN ('needs_response', 'warning_needs_response') THEN 1 ELSE 0 END) as needs_response,
      COALESCE(SUM(amount), 0) as total_amount,
      COALESCE(SUM(CASE WHEN status = 'lost' THEN amount ELSE 0 END), 0) as lost_amount
     FROM disputes ${dateFilter}
     GROUP BY store_name
     ORDER BY total DESC`,
    params
  ).map(r => ({
    ...r,
    win_rate: (r.won + r.lost) > 0 ? parseFloat(((r.won / (r.won + r.lost)) * 100).toFixed(1)) : null,
  }));

  const byReason = all(
    `SELECT
      reason,
      COUNT(*) as total,
      SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) as won,
      SUM(CASE WHEN status = 'lost' THEN 1 ELSE 0 END) as lost
     FROM disputes ${dateFilter}
     GROUP BY reason
     ORDER BY total DESC`,
    params
  ).map(r => ({
    ...r,
    win_rate: (r.won + r.lost) > 0 ? parseFloat(((r.won / (r.won + r.lost)) * 100).toFixed(1)) : null,
  }));

  // Group by week if period > 60 days, otherwise by date
  const days = periodToDays(period);
  const groupExpr = days > 60 ? "strftime('%Y-W%W', created_at)" : "date(created_at)";
  const overTime = all(
    `SELECT
      ${groupExpr} as date,
      COUNT(*) as opened,
      SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) as won,
      SUM(CASE WHEN status = 'lost' THEN 1 ELSE 0 END) as lost
     FROM disputes ${dateFilter}
     GROUP BY ${groupExpr}
     ORDER BY date ASC`,
    params
  );

  return { summary, byStore, byReason, overTime };
}

/**
 * Get upcoming deadlines for disputes needing response.
 */
function getUpcomingDeadlines() {
  return all(
    `SELECT *, CAST(julianday(due_by) - julianday('now') AS INTEGER) as days_remaining
     FROM disputes
     WHERE status IN ('needs_response', 'warning_needs_response')
       AND due_by IS NOT NULL
     ORDER BY due_by ASC`,
    []
  ).map(d => {
    const dr = d.days_remaining;
    let urgency;
    if (dr < 0) urgency = "overdue";
    else if (dr === 0) urgency = "today";
    else if (dr <= 3) urgency = "urgent";
    else if (dr <= 7) urgency = "soon";
    else urgency = "normal";
    return {
      ...d,
      products: JSON.parse(d.products || "[]"),
      metadata: JSON.parse(d.metadata || "{}"),
      evidence_generated: !!d.evidence_generated,
      urgency,
    };
  });
}

// Helpers
function periodToStartDate(period) {
  const days = periodToDays(period);
  if (!days) return null; // "all"
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}

function periodToDays(period) {
  switch (period) {
    case "30d": return 30;
    case "90d": return 90;
    case "all": return null;
    default: return 30;
  }
}
```

- [ ] **Step 2: Update exports**

Replace the existing `module.exports` block:

```javascript
module.exports = {
  upsertDispute,
  getDisputes,
  getDispute,
  getDisputeByStripeId,
  getDisputeStats,
  deleteDispute,
  getDueForAutoSubmit,
  setHold,
  setAutoSubmitAt,
  clearAutoSubmit,
  getDisputeAnalytics,
  getUpcomingDeadlines,
};
```

- [ ] **Step 3: Verify**

Run: `cd /c/Users/camst/woo-comprehensive-monitor/server && node -e "require('./src/db').initDB(); const ds = require('./src/services/dispute-service'); console.log(Object.keys(ds))"`
Expected: Array with 12 function names, no errors.

- [ ] **Step 4: Commit**

```bash
git add server/src/services/dispute-service.js
git commit -m "feat: add auto-submit, analytics, and deadline functions to dispute-service

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Dispute Routes — New Endpoints

**Files:**
- Modify: `server/src/routes/disputes.js` (add 4 new routes BEFORE the `:id` route, modify existing submit route)

- [ ] **Step 1: Add new routes**

In `server/src/routes/disputes.js`, add these routes AFTER the `/disputes/stats` route (line 21) and BEFORE the `/disputes/:id` route (line 23):

```javascript
// Analytics — MUST be before /:id to avoid param capture
router.get("/disputes/analytics", (req, res) => {
  const period = req.query.period || "30d";
  const analytics = disputeService.getDisputeAnalytics(period);
  res.json({ status: "ok", ...analytics });
});

// Deadlines — MUST be before /:id
router.get("/disputes/deadlines", (req, res) => {
  const deadlines = disputeService.getUpcomingDeadlines();
  res.json({ status: "ok", deadlines });
});
```

Add these routes AFTER the existing delete route (line 32):

```javascript
// Hold auto-submit
router.post("/disputes/:id/hold", (req, res) => {
  const dispute = disputeService.getDispute(parseInt(req.params.id));
  if (!dispute) return res.status(404).json({ error: "Dispute not found" });
  disputeService.setHold(dispute.id, 1);
  res.json({ success: true, message: "Auto-submit paused" });
});

// Release hold (resume auto-submit with fresh 24h timer)
router.post("/disputes/:id/release", (req, res) => {
  const dispute = disputeService.getDispute(parseInt(req.params.id));
  if (!dispute) return res.status(404).json({ error: "Dispute not found" });
  disputeService.setHold(dispute.id, 0);
  res.json({ success: true, message: "Auto-submit resumed, will submit in 24h" });
});
```

- [ ] **Step 2: Modify existing submit route to clear auto-submit**

In the existing `POST /disputes/:id/submit` handler, after the `upsertDispute` call (around line 87), add:

```javascript
    // Clear auto-submit timer since evidence was manually submitted
    disputeService.clearAutoSubmit(dispute.id);
```

- [ ] **Step 3: Commit**

```bash
git add server/src/routes/disputes.js
git commit -m "feat: add analytics, deadlines, hold/release endpoints + clear timer on manual submit

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Auto-Submit Cron + Tracking.js Update

**Files:**
- Modify: `server/src/index.js` (add auto-submit cron)
- Modify: `server/src/routes/tracking.js` (set auto_submit_at on dispute_created)

- [ ] **Step 1: Add auto-submit cron to index.js**

Add after the revenue sync cron in `index.js`:

```javascript
  // Auto-submit dispute evidence every 15 min (offset from health check)
  const { getDueForAutoSubmit, clearAutoSubmit } = require("./services/dispute-service");
  const { createAlert } = require("./services/alert-service");
  let _autoSubmitRunning = false;
  cron.schedule("5,20,35,50 * * * *", async () => {
    if (_autoSubmitRunning) return;
    _autoSubmitRunning = true;
    try {
      const due = getDueForAutoSubmit();
      for (const dispute of due) {
        if (!dispute.consumer_key || !dispute.consumer_secret || !dispute.store_api_url) {
          console.log(`[AutoSubmit] Skipping ${dispute.stripe_dispute_id} — no store credentials`);
          continue;
        }
        try {
          const authHeader = "Basic " + Buffer.from(`${dispute.consumer_key}:${dispute.consumer_secret}`).toString("base64");
          await require("axios").post(
            `${dispute.store_api_url}/wp-json/wcm/v1/disputes/${dispute.stripe_dispute_id}/submit`,
            {},
            { headers: { Authorization: authHeader }, timeout: 30000 }
          );
          clearAutoSubmit(dispute.id);
          console.log(`[AutoSubmit] Submitted evidence for ${dispute.stripe_dispute_id}`);
        } catch (err) {
          console.error(`[AutoSubmit] Failed ${dispute.stripe_dispute_id}: ${err.message}`);
          createAlert({
            subject: `Auto-submit failed: ${dispute.stripe_dispute_id}`,
            message: `Failed to auto-submit evidence for dispute ${dispute.stripe_dispute_id} on ${dispute.store_name}. Error: ${err.message}`,
            storeId: dispute.store_id,
            severity: "high",
            type: "dispute",
          });
        }
      }
    } finally {
      _autoSubmitRunning = false;
    }
  });
```

- [ ] **Step 2: Update tracking.js to set auto_submit_at on dispute_created**

In `server/src/routes/tracking.js`, in the `dispute_created` handler (after the `upsertDispute` call, around line 77), add:

```javascript
      // Set auto-submit timer if evidence was generated
      if (req.body.evidence_generated) {
        const { setAutoSubmitAt } = require("../services/dispute-service");
        const submitAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        setAutoSubmitAt(req.body.dispute_id, submitAt);
      }
```

- [ ] **Step 3: Verify server loads**

Run: `cd /c/Users/camst/woo-comprehensive-monitor/server && node -e "require('./src/db').initDB(); const { createApp } = require('./src/app'); const app = createApp(); console.log('OK')"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add server/src/index.js server/src/routes/tracking.js
git commit -m "feat: add auto-submit cron (15min offset) + set timer on dispute creation

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Chunk 2: Dashboard UI — Tabs, Timeline, Analytics, Auto-Submit Controls

### Task 5: Rewrite Disputes.jsx

**Files:**
- Modify: `server/dashboard/src/pages/Disputes.jsx` (full rewrite — add tabs, deadline timeline, analytics, hold/resume buttons)

- [ ] **Step 1: Rewrite Disputes.jsx**

Replace the entire content of `server/dashboard/src/pages/Disputes.jsx`:

```jsx
import { useEffect, useState } from "react";
import { api, apiPost, apiDelete } from "../api/client";
import { useToast } from "../components/Toast";
import { timeAgo } from "../utils/time";
import { Line, Bar } from "react-chartjs-2";
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, Title, Tooltip, Legend, Filler,
} from "chart.js";
import StatCard from "../components/StatCard";
import PageHeader from "../components/PageHeader";
import TimeRangeSelector from "../components/TimeRangeSelector";
import DataTable from "../components/DataTable";
import { SkeletonCard } from "../components/Skeleton";
import {
  Shield, AlertTriangle, CheckCircle, XCircle, Clock,
  ChevronDown, ChevronRight, Trash2, Filter, DollarSign, RefreshCw,
  Send, Eye, FileText, Loader, Pause, Play, Calendar, TrendingUp,
} from "lucide-react";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler);

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
  needs_response:         { bg: "bg-red-50",    text: "text-red-700",    label: "Needs Response" },
  warning_needs_response: { bg: "bg-red-50",    text: "text-red-700",    label: "Needs Response" },
  under_review:           { bg: "bg-yellow-50", text: "text-yellow-700", label: "Under Review" },
  won:                    { bg: "bg-green-50",  text: "text-green-700",  label: "Won" },
  lost:                   { bg: "bg-red-50",    text: "text-red-700",    label: "Lost" },
  charge_refunded:        { bg: "bg-gray-50",   text: "text-gray-600",   label: "Refunded" },
};

const ANALYTICS_PERIODS = [
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
  { value: "all", label: "All Time" },
];

export default function Disputes() {
  const [tab, setTab] = useState("active");

  return (
    <div className="space-y-5">
      <PageHeader title="Disputes" subtitle="Manage and track Stripe disputes">
        <div className="flex gap-1">
          <button onClick={() => setTab("active")}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${tab === "active" ? "bg-indigo-50 text-indigo-600" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
            Active Disputes
          </button>
          <button onClick={() => setTab("analytics")}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${tab === "analytics" ? "bg-indigo-50 text-indigo-600" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
            Analytics
          </button>
        </div>
      </PageHeader>

      {tab === "active" ? <ActiveDisputes /> : <AnalyticsTab />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// Active Disputes Tab
// ═══════════════════════════════════════════════════════

function ActiveDisputes() {
  const [data, setData] = useState({ disputes: [], total: 0 });
  const [stats, setStats] = useState(null);
  const [deadlines, setDeadlines] = useState([]);
  const [stores, setStores] = useState([]);
  const [filters, setFilters] = useState({ storeId: "", status: "" });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [expanded, setExpanded] = useState(new Set());
  const toast = useToast();

  const syncHistorical = async () => {
    setSyncing(true);
    try {
      const res = await apiPost("/api/disputes/sync", {});
      const summary = (res.results || []).map(r => `${r.store}: ${r.status}${r.result ? ` (synced: ${r.result.synced})` : ""}`).join(", ");
      toast(summary || "Sync complete");
      fetchAll();
    } catch (err) { toast(err.message, "error"); }
    setSyncing(false);
  };

  const fetchAll = () => {
    fetchDisputes();
    api("/api/disputes/stats").then(setStats).catch(() => {});
    api("/api/disputes/deadlines").then(r => setDeadlines(r.deadlines || [])).catch(() => {});
  };

  const fetchDisputes = (offset = 0, append = false) => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "50", offset: String(offset) });
    if (filters.storeId) params.set("storeId", filters.storeId);
    if (filters.status) params.set("status", filters.status);
    api(`/api/disputes?${params}`).then((res) => {
      setData((prev) => append ? { disputes: [...prev.disputes, ...res.disputes], total: res.total } : res);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(() => { fetchAll(); api("/api/stores").then((r) => setStores(r.stores || [])).catch(() => {}); }, []);
  useEffect(() => { fetchDisputes(); }, [filters]);

  const toggle = (id) => setExpanded((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const scrollToDispute = (id) => {
    setExpanded(prev => new Set(prev).add(id));
    setTimeout(() => document.getElementById(`dispute-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
  };

  const dueBadge = (dueBy) => {
    if (!dueBy) return <span className="text-xs text-slate-400">—</span>;
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
          <MiniStat label="Total" value={stats.total} icon={<Shield size={14} />} />
          <MiniStat label="Needs Response" value={stats.needsResponse} icon={<AlertTriangle size={14} />} color="red" />
          <MiniStat label="Won" value={stats.won} icon={<CheckCircle size={14} />} color="green" />
          <MiniStat label="Lost" value={stats.lost} icon={<XCircle size={14} />} color="red" />
          <MiniStat label="$ at Risk" value={`$${stats.totalAmount.toFixed(2)}`} icon={<DollarSign size={14} />} color="yellow" />
        </div>
      )}

      {/* Deadline Timeline */}
      {deadlines.length > 0 && <DeadlineTimeline deadlines={deadlines} onClickDispute={scrollToDispute} />}

      {/* Filters + Sync */}
      <div className="flex gap-2 items-center flex-wrap">
        <Filter size={14} className="text-slate-400" />
        <select value={filters.storeId} onChange={(e) => setFilters((f) => ({ ...f, storeId: e.target.value }))}
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white">
          <option value="">All Stores</option>
          {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white">
          <option value="">All Statuses</option>
          <option value="needs_response">Needs Response</option>
          <option value="under_review">Under Review</option>
          <option value="won">Won</option>
          <option value="lost">Lost</option>
        </select>
        <div className="ml-auto">
          <button onClick={syncHistorical} disabled={syncing}
            className="flex items-center gap-2 px-4 py-1.5 bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-600 disabled:opacity-50 transition-colors">
            {syncing ? <><RefreshCw size={13} className="animate-spin" /> Syncing...</> : <><RefreshCw size={13} /> Sync from Stripe</>}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="hidden md:grid grid-cols-[1fr_1fr_80px_1fr_110px_100px_30px] gap-2 px-4 py-2.5 bg-slate-50 border-b text-xs font-semibold text-slate-500 uppercase tracking-wide">
          <span>Store</span><span>Customer</span><span>Amount</span><span>Reason</span><span>Status</span><span>Due By</span><span></span>
        </div>
        {data.disputes.map((d) => {
          const isOpen = expanded.has(d.id);
          const st = STATUS_STYLES[d.status] || STATUS_STYLES.needs_response;
          return (
            <div key={d.id} id={`dispute-${d.id}`} className="border-b border-gray-50 last:border-0">
              <div onClick={() => toggle(d.id)}
                className="grid grid-cols-[1fr_1fr_80px_1fr_110px_100px_30px] gap-2 px-4 py-3 items-center cursor-pointer hover:bg-slate-50 transition-colors text-sm">
                <span className="font-medium text-slate-700 truncate">{d.store_name || "Unknown"}</span>
                <span className="text-slate-600 truncate">{d.customer_name || d.customer_email || "—"}</span>
                <span className="font-medium text-slate-700">${d.amount?.toFixed(2) || "0.00"}</span>
                <span className="text-slate-600">{REASONS[d.reason] || d.reason || "—"}</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-lg inline-block w-fit ${st.bg} ${st.text}`}>{st.label}</span>
                {dueBadge(d.due_by)}
                <span className="text-slate-400">{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
              </div>
              {isOpen && <DisputeDetail d={d} toast={toast} onRefresh={fetchAll} />}
            </div>
          );
        })}
        {data.disputes.length === 0 && !loading && (
          <div className="text-center py-12">
            <Shield size={32} className="mx-auto text-slate-300 mb-3" />
            <p className="text-sm text-slate-400">No disputes found</p>
            <p className="text-xs text-slate-300 mt-1">Disputes will appear here when detected via Stripe webhooks</p>
          </div>
        )}
      </div>

      {data.disputes.length < data.total && (
        <button onClick={() => fetchDisputes(data.disputes.length, true)}
          className="w-full py-2 text-sm text-slate-500 hover:text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
          Load more ({data.total - data.disputes.length} remaining)
        </button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// Deadline Timeline
// ═══════════════════════════════════════════════════════

function DeadlineTimeline({ deadlines, onClickDispute }) {
  const groups = { overdue: [], today: [], urgent: [], soon: [], normal: [] };
  deadlines.forEach(d => {
    const key = d.urgency || "normal";
    if (groups[key]) groups[key].push(d);
  });

  const groupConfig = {
    overdue: { label: "Overdue", bg: "bg-red-50", badge: "bg-red-100 text-red-700" },
    today:   { label: "Due Today", bg: "bg-red-50", badge: "bg-red-100 text-red-700" },
    urgent:  { label: "1-3 Days", bg: "bg-amber-50", badge: "bg-amber-100 text-amber-700" },
    soon:    { label: "4-7 Days", bg: "bg-yellow-50", badge: "bg-yellow-100 text-yellow-700" },
    normal:  { label: "7+ Days", bg: "bg-slate-50", badge: "bg-slate-100 text-slate-600" },
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
      <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
        <Calendar size={15} className="text-indigo-500" /> Upcoming Deadlines
      </h3>
      <div className="space-y-3">
        {Object.entries(groups).map(([key, items]) => {
          if (items.length === 0) return null;
          const cfg = groupConfig[key];
          return (
            <div key={key}>
              <p className="text-xs font-medium text-slate-400 uppercase mb-1.5">{cfg.label}</p>
              <div className="space-y-1">
                {items.map(d => (
                  <button key={d.id} onClick={() => onClickDispute(d.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm hover:opacity-80 transition-opacity ${cfg.bg}`}>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${cfg.badge} min-w-[60px] text-center`}>
                      {d.days_remaining < 0 ? "OVERDUE" : d.days_remaining === 0 ? "TODAY" : `${d.days_remaining}d`}
                    </span>
                    <span className="font-medium text-slate-700 truncate">{d.store_name}</span>
                    <span className="text-slate-500 truncate">{d.customer_name || "—"}</span>
                    <span className="ml-auto font-medium text-slate-700">${d.amount?.toFixed(2)}</span>
                    <span className="text-xs text-slate-400">{REASONS[d.reason] || d.reason}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// Dispute Detail (expanded row)
// ═══════════════════════════════════════════════════════

function DisputeDetail({ d, toast, onRefresh }) {
  const [evidence, setEvidence] = useState(null);
  const [loadingEvidence, setLoadingEvidence] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [staging, setStaging] = useState(false);
  const [holding, setHolding] = useState(false);

  const loadEvidence = async () => {
    setLoadingEvidence(true);
    try { setEvidence((await api(`/api/disputes/${d.id}/evidence`)).evidence || (await api(`/api/disputes/${d.id}/evidence`))); }
    catch (err) { toast("Failed to load evidence: " + err.message, "error"); }
    setLoadingEvidence(false);
  };

  const stageEvidence = async () => {
    setStaging(true);
    try { await apiPost(`/api/disputes/${d.id}/stage`, {}); toast("Evidence staged on Stripe"); onRefresh(); }
    catch (err) { toast("Staging failed: " + err.message, "error"); }
    setStaging(false);
  };

  const submitEvidence = async () => {
    if (!confirm("Submit evidence to Stripe? This is FINAL and cannot be amended.")) return;
    setSubmitting(true);
    try { await apiPost(`/api/disputes/${d.id}/submit`, {}); toast("Evidence submitted to Stripe!"); onRefresh(); }
    catch (err) { toast("Submission failed: " + err.message, "error"); }
    setSubmitting(false);
  };

  const toggleHold = async () => {
    setHolding(true);
    const action = d.hold ? "release" : "hold";
    try { await apiPost(`/api/disputes/${d.id}/${action}`, {}); toast(action === "hold" ? "Auto-submit paused" : "Auto-submit resumed"); onRefresh(); }
    catch (err) { toast(err.message, "error"); }
    setHolding(false);
  };

  const isSubmitted = d.metadata?.evidence_submitted;
  const isStaged = d.metadata?.evidence_staged || d.evidence_generated;
  const hasAutoSubmit = d.auto_submit_at && !d.hold && !isSubmitted;
  const isHeld = d.hold && !isSubmitted;

  // Compute countdown
  let countdown = null;
  if (hasAutoSubmit) {
    const submitAt = new Date(d.auto_submit_at.endsWith("Z") ? d.auto_submit_at : d.auto_submit_at + "Z");
    const ms = submitAt - Date.now();
    if (ms > 0) {
      const hours = Math.floor(ms / 3600000);
      const mins = Math.floor((ms % 3600000) / 60000);
      countdown = `${hours}h ${mins}m`;
    } else {
      countdown = "submitting soon...";
    }
  }

  return (
    <div className="px-6 pb-4 bg-slate-50/50 space-y-3 text-sm">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Detail label="Order #" value={d.order_id} />
        <Detail label="Dispute ID" value={d.stripe_dispute_id} mono />
        <Detail label="Email" value={d.customer_email} />
        <Detail label="Created" value={d.created_at ? timeAgo(d.created_at) : "—"} />
      </div>

      {d.products?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 mb-1">Products</p>
          <div className="space-y-0.5">
            {d.products.map((p, i) => (
              <p key={i} className="text-xs text-slate-600">{p.qty}x {p.name} — ${parseFloat(p.total || 0).toFixed(2)}</p>
            ))}
          </div>
        </div>
      )}

      {d.evidence_summary && (
        <div>
          <p className="text-xs font-semibold text-slate-500 mb-1">Evidence Summary</p>
          <p className="text-xs text-slate-600 whitespace-pre-wrap bg-white rounded-lg p-3 border border-gray-100">{d.evidence_summary}</p>
        </div>
      )}

      {/* Evidence status + auto-submit status */}
      <div className="flex items-center gap-2 flex-wrap">
        {isSubmitted ? (
          <span className="flex items-center gap-1 text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded-lg">
            <CheckCircle size={12} /> Evidence Submitted
          </span>
        ) : isStaged ? (
          <span className="flex items-center gap-1 text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg">
            <FileText size={12} /> Evidence Staged
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs font-medium text-gray-500 bg-gray-50 px-2 py-1 rounded-lg">
            <AlertTriangle size={12} /> No Evidence
          </span>
        )}

        {hasAutoSubmit && (
          <span className="flex items-center gap-1 text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded-lg">
            <Clock size={12} /> Auto-submits in {countdown}
          </span>
        )}
        {isHeld && (
          <span className="flex items-center gap-1 text-xs font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded-lg">
            <Pause size={12} /> Auto-submit paused
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <button onClick={loadEvidence} disabled={loadingEvidence}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-50 disabled:opacity-50">
          {loadingEvidence ? <Loader size={12} className="animate-spin" /> : <Eye size={12} />} Preview Evidence
        </button>

        {!isStaged && !isSubmitted && d.status !== "won" && d.status !== "lost" && (
          <button onClick={stageEvidence} disabled={staging}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500 text-white rounded-lg text-xs font-medium hover:bg-indigo-600 disabled:opacity-50">
            {staging ? <Loader size={12} className="animate-spin" /> : <FileText size={12} />} Stage Evidence
          </button>
        )}

        {!isSubmitted && d.status !== "won" && d.status !== "lost" && (
          <button onClick={submitEvidence} disabled={submitting}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50">
            {submitting ? <Loader size={12} className="animate-spin" /> : <Send size={12} />} Submit to Stripe
          </button>
        )}

        {/* Hold / Release button */}
        {!isSubmitted && d.status !== "won" && d.status !== "lost" && (isStaged || hasAutoSubmit || isHeld) && (
          <button onClick={toggleHold} disabled={holding}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-50 disabled:opacity-50">
            {holding ? <Loader size={12} className="animate-spin" /> : d.hold ? <Play size={12} /> : <Pause size={12} />}
            {d.hold ? "Resume Auto-Submit" : "Hold"}
          </button>
        )}

        <button onClick={() => { apiDelete(`/api/disputes/${d.id}`).then(() => { toast("Dispute removed"); onRefresh(); }); }}
          className="flex items-center gap-1 px-3 py-1.5 text-xs text-red-500 hover:text-red-700 border border-red-200 rounded-lg hover:bg-red-50">
          <Trash2 size={12} /> Remove
        </button>
      </div>

      {/* Evidence preview */}
      {evidence && (
        <div className="mt-2 bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-semibold text-slate-500 mb-3 flex items-center gap-1"><FileText size={13} /> Evidence Preview</p>
          <div className="space-y-2">
            {typeof evidence === "object" && !evidence.error ? (
              Object.entries(evidence).filter(([k]) => k !== "error").map(([key, value]) => (
                <div key={key} className="border-b border-gray-50 pb-2 last:border-0">
                  <p className="text-xs text-slate-400 font-mono">{key}</p>
                  <p className="text-xs text-slate-700 whitespace-pre-wrap mt-0.5">{typeof value === "string" ? value : JSON.stringify(value)}</p>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-500">{evidence.error || "No evidence available. Click 'Stage Evidence' to auto-generate."}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// Analytics Tab
// ═══════════════════════════════════════════════════════

function AnalyticsTab() {
  const [period, setPeriod] = useState("30d");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api(`/api/disputes/analytics?period=${period}`)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [period]);

  if (loading || !data) return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}</div>
      <SkeletonCard className="h-64" />
    </div>
  );

  const s = data.summary;

  // Reason bar chart
  const reasonChart = {
    labels: data.byReason.map(r => REASONS[r.reason] || r.reason || "Unknown"),
    datasets: [
      { label: "Won", data: data.byReason.map(r => r.won), backgroundColor: "#34d399" },
      { label: "Lost", data: data.byReason.map(r => r.lost), backgroundColor: "#f87171" },
    ],
  };

  // Trend line chart
  const trendChart = {
    labels: data.overTime.map(r => r.date),
    datasets: [
      {
        label: "Opened", data: data.overTime.map(r => r.opened), borderColor: "#6366f1",
        backgroundColor: "rgba(99,102,241,0.08)", fill: true, tension: 0.4, pointRadius: 3, borderWidth: 2,
      },
      { label: "Won", data: data.overTime.map(r => r.won), borderColor: "#34d399", tension: 0.4, pointRadius: 3, borderWidth: 2, fill: false },
      { label: "Lost", data: data.overTime.map(r => r.lost), borderColor: "#f87171", tension: 0.4, pointRadius: 3, borderWidth: 2, fill: false },
    ],
  };

  const chartOpts = (type) => ({
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: type === "bar" ? "y" : "x",
    plugins: {
      legend: { position: "top", labels: { boxWidth: 10, font: { size: 11 }, padding: 12 } },
      tooltip: { backgroundColor: "#1e293b", titleColor: "#94a3b8", bodyColor: "#f1f5f9", cornerRadius: 8 },
    },
    scales: {
      x: { stacked: type === "bar", grid: { display: type !== "bar" ? false : undefined }, ticks: { font: { size: 11 }, color: "#94a3b8" } },
      y: { stacked: type === "bar", beginAtZero: true, ticks: { font: { size: 11 }, color: "#94a3b8", precision: 0 }, grid: { color: "#f1f5f9" } },
    },
  });

  const storeColumns = [
    { key: "store_name", label: "Store", sortable: true },
    { key: "total", label: "Total", sortable: true },
    { key: "won", label: "Won", sortable: true },
    { key: "lost", label: "Lost", sortable: true },
    { key: "win_rate", label: "Win Rate", sortable: true, render: (v) => v != null ? <span className={v >= 50 ? "text-emerald-600" : "text-red-500"}>{v}%</span> : "—" },
    { key: "total_amount", label: "Disputed", sortable: true, render: (v) => `$${(v || 0).toFixed(2)}` },
    { key: "lost_amount", label: "Lost", sortable: true, render: (v) => `$${(v || 0).toFixed(2)}` },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <TimeRangeSelector value={period} onChange={setPeriod} options={ANALYTICS_PERIODS} />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Disputes" value={s.total} icon={<Shield size={18} />} />
        <StatCard label="Win Rate" value={s.winRate != null ? `${s.winRate}%` : "—"} icon={<TrendingUp size={18} />} variant="hero" />
        <StatCard label="Total Disputed" value={`$${s.totalAmount.toFixed(2)}`} icon={<DollarSign size={18} />} />
        <StatCard label="Total Lost" value={`$${s.lostAmount.toFixed(2)}`} icon={<XCircle size={18} />}
          sub={s.lostAmount > 0 ? "review reasons" : "none"} />
      </div>

      {/* Win/Loss by Reason */}
      {data.byReason.length > 0 && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Win/Loss by Reason</h3>
          <div style={{ height: Math.max(data.byReason.length * 40 + 40, 150) }}>
            <Bar data={reasonChart} options={chartOpts("bar")} />
          </div>
        </div>
      )}

      {/* Per-Store Table */}
      {data.byStore.length > 0 && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Disputes by Store</h3>
          <DataTable columns={storeColumns} data={data.byStore} />
        </div>
      )}

      {/* Trend Over Time */}
      {data.overTime.length > 0 && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Disputes Over Time</h3>
          <div style={{ height: 280 }}>
            <Line data={trendChart} options={chartOpts("line")} />
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// Shared helpers
// ═══════════════════════════════════════════════════════

function MiniStat({ label, value, icon, color }) {
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
      <p className={`text-sm text-slate-700 ${mono ? "font-mono text-xs break-all" : ""}`}>{value || "—"}</p>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add server/dashboard/src/pages/Disputes.jsx
git commit -m "feat: rewrite Disputes page with tabs, deadline timeline, analytics, auto-submit controls

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Build, Test, Deploy

- [ ] **Step 1: Build dashboard**

Run: `cd /c/Users/camst/woo-comprehensive-monitor/server/dashboard && npm run build`
Expected: Vite build succeeds.

- [ ] **Step 2: Verify server loads**

Run: `cd /c/Users/camst/woo-comprehensive-monitor/server && node -e "require('./src/db').initDB(); const { createApp } = require('./src/app'); const app = createApp(); console.log('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit build**

```bash
git add -f server/dashboard/dist/
git commit -m "build: dashboard with dispute command center upgrade

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4: Push + deploy**

```bash
git push origin master
```

Then deploy to Coolify using the established process (create temp Sanctum token, `POST /api/v1/deploy?uuid=as80wsgckw0wo0kk4gcggkcg&force=true`, delete token).
