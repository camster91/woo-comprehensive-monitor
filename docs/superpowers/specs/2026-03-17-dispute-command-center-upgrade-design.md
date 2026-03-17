# Dispute Command Center Upgrade — Design Spec

## Overview

Upgrade the dispute system with three features: auto-submit evidence to Stripe after a 24-hour review window, win/loss analytics with per-store, per-reason, and over-time breakdowns, and a deadline timeline showing upcoming due dates with countdown badges.

## Context

- Evidence auto-staging already works — disputes are auto-staged (submit=false) on creation via `WCM_Evidence_Submitter::auto_stage_evidence()`
- Evidence submission already works — `POST /api/disputes/:id/submit` proxies to the store's REST endpoint which calls `WCM_Evidence_Submitter::submit_evidence()`
- The disputes table already has: status, reason, store_id, amount, due_by, created_at, metadata (JSON)
- Dashboard Disputes page already has: stats cards, filters, expandable detail rows, evidence preview/stage/submit buttons
- Shared components from UI overhaul available: StatCard, PageHeader, TimeRangeSelector, DataTable

## Users

- **Cameron (owner):** Wants disputes handled automatically, analytics to track performance
- **Natalie (ops):** Reviews evidence before submission, needs to know what's due soon

---

## Section 1: Auto-Submit with 24h Delay

### Database Changes (migration 005)

Add two columns to the `disputes` table:

```sql
ALTER TABLE disputes ADD COLUMN auto_submit_at TEXT;
ALTER TABLE disputes ADD COLUMN hold INTEGER DEFAULT 0;
```

Index: `CREATE INDEX IF NOT EXISTS idx_disputes_auto_submit ON disputes(auto_submit_at) WHERE hold = 0;`

### Server Logic

**dispute-service.js — new functions:**

- `getDueForAutoSubmit()` — queries disputes where `auto_submit_at <= datetime('now') AND hold = 0 AND status = 'needs_response'`. Returns array of disputes with their store details.
- `setHold(id, hold)` — updates `hold` column (1 = held, 0 = released). When releasing, resets `auto_submit_at` to now + 24 hours.
- `setAutoSubmitAt(id, timestamp)` — sets the auto-submit timer. Called by tracking.js when a dispute is created with evidence staged.

**Auto-submit cron (index.js):**

New cron job every 15 minutes (`*/15 * * * *`). Calls `getDueForAutoSubmit()`, then for each dispute:
1. Look up the store's API credentials
2. Call the store's `POST /wp-json/wcm/v1/disputes/{stripeId}/submit` via WooCommerceRestApi or axios
3. On success: update dispute status metadata with `evidence_submitted: true`, clear `auto_submit_at`
4. On failure: log error, create alert (severity: high, type: dispute), retry next cycle
5. Mutex guard (`_autoSubmitRunning`) to prevent overlap

**tracking.js — modification:**

When a `dispute_created` event is received and the dispute has `evidence_generated: true`, set `auto_submit_at` to `datetime('now', '+24 hours')` on the upserted dispute.

### API Changes

**New endpoints in disputes.js:**

- `POST /api/disputes/:id/hold` — sets hold = 1, clears auto_submit_at
- `POST /api/disputes/:id/release` — sets hold = 0, resets auto_submit_at to now + 24h

### Dashboard Changes

In the DisputeDetail expanded section (Disputes.jsx):

- If `auto_submit_at` is set and `hold = 0`: show countdown text "Auto-submits in Xh Ym" with an amber clock icon, plus a "Hold" button (pause icon)
- If `hold = 1`: show "Auto-submit paused" with a "Resume" button (play icon)
- If evidence was already submitted: show "Evidence Submitted" badge (existing behavior)
- Manual "Submit to Stripe" button still works — clears the timer on success

Countdown updates every 60 seconds via the existing auto-refresh cycle (no need for real-time timer — the page refreshes data every 60s already).

---

## Section 2: Win/Loss Analytics

### Server Logic

**dispute-service.js — new function:**

`getDisputeAnalytics(period)` — accepts period string ("30d", "90d", "all"). Returns object with three arrays:

1. **byStore:** `SELECT store_name, COUNT(*) as total, SUM(CASE WHEN status='won' THEN 1 ELSE 0 END) as won, SUM(CASE WHEN status='lost' THEN 1 ELSE 0 END) as lost, SUM(CASE WHEN status='needs_response' THEN 1 ELSE 0 END) as needs_response, SUM(amount) as total_amount, SUM(CASE WHEN status='lost' THEN amount ELSE 0 END) as lost_amount FROM disputes WHERE created_at >= ? GROUP BY store_name ORDER BY total DESC`
   - `win_rate` calculated in JS: `won / (won + lost) * 100` (avoid division by zero)

2. **byReason:** `SELECT reason, COUNT(*) as total, SUM(CASE WHEN status='won' THEN 1 ELSE 0 END) as won, SUM(CASE WHEN status='lost' THEN 1 ELSE 0 END) as lost FROM disputes WHERE created_at >= ? GROUP BY reason ORDER BY total DESC`
   - `win_rate` calculated in JS

3. **overTime:** `SELECT date(created_at) as date, COUNT(*) as opened, SUM(CASE WHEN status='won' THEN 1 ELSE 0 END) as won, SUM(CASE WHEN status='lost' THEN 1 ELSE 0 END) as lost FROM disputes WHERE created_at >= ? GROUP BY date(created_at) ORDER BY date ASC`
   - For periods > 60 days, group by `strftime('%Y-%W', created_at)` (ISO week) instead of date

4. **summary:** `SELECT COUNT(*) as total, SUM(CASE WHEN status='won' THEN 1 ELSE 0 END) as won, SUM(CASE WHEN status='lost' THEN 1 ELSE 0 END) as lost, SUM(amount) as totalAmount, SUM(CASE WHEN status='lost' THEN amount ELSE 0 END) as lostAmount FROM disputes WHERE created_at >= ?`
   - `winRate` calculated as `won / (won + lost) * 100`

### API Changes

**New endpoint in disputes.js:**

- `GET /api/disputes/analytics?period=30d` — calls `getDisputeAnalytics(period)`, returns `{ status: "ok", summary, byStore, byReason, overTime }`

### Dashboard Changes

**Disputes.jsx gets a tab system:**

Two tabs at the top of the page: "Active Disputes" and "Analytics"

- "Active Disputes" tab contains the existing disputes list (filters, table, detail rows) plus the new deadline timeline (Section 3)
- "Analytics" tab contains the analytics dashboard

**Analytics tab layout (top to bottom):**

1. **Header:** PageHeader with "Dispute Analytics" title + TimeRangeSelector (30d, 90d, All Time)

2. **Summary stat cards (4-card grid):**
   - Total Disputes (StatCard default)
   - Win Rate (StatCard hero — the key metric, shows percentage)
   - Total Disputed (StatCard default — formatted as currency)
   - Total Lost (StatCard default — formatted as currency, red-tinted if > 0)

3. **Win/Loss by Reason (Chart.js horizontal bar):**
   - Horizontal stacked bar chart
   - Each bar = one dispute reason (e.g., "fraudulent", "subscription_canceled")
   - Green segment = won, red segment = lost, gray = pending
   - Sorted by total count descending
   - Chart.js `indexAxis: 'y'` for horizontal bars

4. **Per-Store Table (DataTable):**
   - Columns: Store, Total, Won, Lost, Win Rate, Amount Disputed, Amount Lost
   - Win Rate column: green text if >= 50%, red if < 50%
   - Sortable by any column, default sort by total descending

5. **Trend Over Time (Chart.js line chart):**
   - Three lines: Opened (indigo), Won (emerald), Lost (red)
   - X-axis: dates or weeks depending on period
   - Same chart styling as Revenue trend chart (gradient fill under opened line)

---

## Section 3: Deadline Timeline

### Server Logic

**dispute-service.js — new function:**

`getUpcomingDeadlines()` — returns disputes where `status = 'needs_response' AND due_by IS NOT NULL`, sorted by `due_by ASC`. For each dispute, compute:
- `days_remaining`: `CAST(julianday(due_by) - julianday('now') AS INTEGER)`
- `urgency`: "overdue" if days_remaining < 0, "today" if 0, "urgent" if 1-3, "soon" if 4-7, "normal" if 7+

### API Changes

**New endpoint in disputes.js:**

- `GET /api/disputes/deadlines` — calls `getUpcomingDeadlines()`, returns `{ status: "ok", deadlines }`

### Dashboard Changes

**Added to the Active Disputes tab in Disputes.jsx, above the existing table:**

A "Upcoming Deadlines" section that renders only when there are disputes needing response with due dates.

**Layout:**
- Section header: "Upcoming Deadlines" with a Calendar icon
- Grouped by urgency: "Overdue" (red bg), "This Week" (amber bg), "Next Week" (yellow bg), "Later" (slate bg)
- Each item is a compact row: countdown badge (e.g., "2d left", "OVERDUE"), store name, customer name, amount, reason
- Clicking a row scrolls to and expands that dispute in the table below (using the dispute ID to trigger expansion state)

**Countdown badge colors:**
- Overdue / Due today: `bg-red-100 text-red-700`
- 1-3 days: `bg-amber-100 text-amber-700`
- 4-7 days: `bg-yellow-100 text-yellow-700`
- 7+ days: `bg-slate-100 text-slate-600`

---

## File Changes Summary

### New Files
| File | Purpose |
|------|---------|
| `server/migrations/005_dispute_auto_submit.sql` | Add auto_submit_at and hold columns |

### Modified Files
| File | Changes |
|------|---------|
| `server/src/db.js` | Add migration 005 to versionedMigrations |
| `server/src/services/dispute-service.js` | Add getDueForAutoSubmit(), setHold(), setAutoSubmitAt(), getDisputeAnalytics(), getUpcomingDeadlines() |
| `server/src/routes/disputes.js` | Add /hold, /release, /analytics, /deadlines endpoints |
| `server/src/routes/tracking.js` | Set auto_submit_at on dispute_created with evidence |
| `server/src/index.js` | Add auto-submit cron (*/15 * * * *) |
| `server/dashboard/src/pages/Disputes.jsx` | Add tabs (Active/Analytics), deadline timeline, hold/resume buttons, countdown display, analytics charts |

### Not Changed
- Plugin PHP code — no changes needed, evidence staging and submission already work
- Other dashboard pages — no changes
- Other services — no changes
