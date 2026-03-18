/**
 * Order Workflow Monitor
 *
 * Tracks order lifecycle: Stripe → ShipStation → Avalara → Completed
 * Alerts when orders go off-track (stuck, missing steps, unexpected status).
 *
 * Expected flow:
 *   1. Stripe payment intent + charge → status "processing"
 *   2. "Order sent to Avalara" (tax recorded)
 *   3. "Order has been exported to Shipstation" (fulfillment queued)
 *   4. ShipStation fulfills → status "completed"
 *
 * Runs hourly. Only checks orders from the last 7 days to avoid noise.
 */

const WooCommerceRestApi = require("@woocommerce/woocommerce-rest-api").default;
const pLimit = require("p-limit");
const { getAllStores } = require("./store-service");
const { createAlert, queueAlertEmail } = require("./alert-service");

// Thresholds (in hours)
const STUCK_PROCESSING_HOURS = 24;   // 24h in processing = stuck
const STUCK_PENDING_HOURS = 2;       // 2 hours in pending = payment issue
const STUCK_ON_HOLD_HOURS = 24;      // 24h on-hold = needs attention

let _workflowRunning = false;

// Workflow alerts use a 24h dedup window (not the global 2h alert dedup)
// so stuck orders only alert once per day, not every hour
const _workflowDedup = {};
const WORKFLOW_DEDUP_MS = 24 * 60 * 60 * 1000;

function workflowShouldDedup(key) {
  const now = Date.now();
  if (_workflowDedup[key] && now - _workflowDedup[key] < WORKFLOW_DEDUP_MS) return true;
  _workflowDedup[key] = now;
  return false;
}

async function checkStoreOrders(store) {
  if (!store.consumer_key || !store.consumer_secret) return null;

  const api = new WooCommerceRestApi({
    url: store.url,
    consumerKey: store.consumer_key,
    consumerSecret: store.consumer_secret,
    version: "wc/v3",
    timeout: 30000,
  });

  const issues = [];
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Check processing orders (should move to completed within 3 days)
  try {
    const { data: processing } = await api.get("orders", {
      status: "processing",
      after: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // look back 30 days for stuck ones
      per_page: 100,
    });

    for (const order of processing) {
      const created = new Date(order.date_created);
      const hoursOld = (Date.now() - created.getTime()) / (1000 * 60 * 60);

      if (hoursOld > STUCK_PROCESSING_HOURS) {
        // Get order notes to understand where it's stuck
        let notes = [];
        try {
          const { data: noteData } = await api.get(`orders/${order.id}/notes`);
          notes = noteData || [];
        } catch (_) {}

        const hasStripe = notes.some(n => /stripe charge complete/i.test(n.note));
        const hasShipStation = notes.some(n => /exported to shipstation/i.test(n.note));
        const hasAvalara = notes.some(n => /sent to avalara/i.test(n.note));
        const hasBackorder = notes.some(n => /backorder/i.test(n.note));

        // Build detail about what's missing
        const missing = [];
        if (!hasStripe) missing.push("no Stripe charge");
        if (!hasShipStation) missing.push("not exported to ShipStation");
        if (!hasAvalara) missing.push("not sent to Avalara");

        const detail = [
          `Order #${order.id} stuck in processing for ${Math.round(hoursOld / 24)}d`,
          `Amount: $${order.total}`,
          `Customer: ${order.billing?.first_name} ${order.billing?.last_name}`,
          missing.length > 0 ? `Missing: ${missing.join(", ")}` : "All steps completed — needs manual completion",
          hasBackorder ? "Note: Product is on backorder" : "",
        ].filter(Boolean).join("\n");

        issues.push({
          type: "stuck_processing",
          severity: hasBackorder ? "medium" : "high",
          orderId: order.id,
          detail,
          daysOld: Math.round(hoursOld / 24),
        });
      }
    }
  } catch (err) {
    console.error(`[Workflow] Failed to check processing orders for ${store.name}: ${err.message}`);
  }

  // Check pending orders (payment should complete within 2 hours)
  try {
    const { data: pending } = await api.get("orders", {
      status: "pending",
      after: sevenDaysAgo,
      per_page: 50,
    });

    let stuckPending = 0;
    for (const order of pending) {
      const created = new Date(order.date_created);
      const hoursOld = (Date.now() - created.getTime()) / (1000 * 60 * 60);
      if (hoursOld > STUCK_PENDING_HOURS) stuckPending++;
    }

    if (stuckPending > 0) {
      issues.push({
        type: "stuck_pending",
        severity: stuckPending > 5 ? "high" : "medium",
        detail: `${stuckPending} orders stuck in pending >2h (payment not completed)`,
      });
    }
  } catch (err) {
    console.error(`[Workflow] Failed to check pending orders for ${store.name}: ${err.message}`);
  }

  // Check on-hold orders
  try {
    const { data: onhold } = await api.get("orders", {
      status: "on-hold",
      after: sevenDaysAgo,
      per_page: 50,
    });

    let stuckOnHold = 0;
    for (const order of onhold) {
      const created = new Date(order.date_created);
      const hoursOld = (Date.now() - created.getTime()) / (1000 * 60 * 60);
      if (hoursOld > STUCK_ON_HOLD_HOURS) stuckOnHold++;
    }

    if (stuckOnHold > 0) {
      issues.push({
        type: "stuck_on_hold",
        severity: "medium",
        detail: `${stuckOnHold} orders on-hold for >48h`,
      });
    }
  } catch (err) {
    console.error(`[Workflow] Failed to check on-hold orders for ${store.name}: ${err.message}`);
  }

  // Check failed orders in last 24h (Stripe payment failures)
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: failed } = await api.get("orders", {
      status: "failed",
      after: oneDayAgo,
      per_page: 50,
    });

    if (failed.length > 0) {
      issues.push({
        type: "failed_payments",
        severity: failed.length > 3 ? "high" : "medium",
        detail: `${failed.length} failed payment(s) in last 24h`,
      });
    }
  } catch (err) {
    console.error(`[Workflow] Failed to check failed orders for ${store.name}: ${err.message}`);
  }

  return { store: store.name, storeId: store.id, issues };
}

async function checkAllStoreOrders() {
  if (_workflowRunning) {
    console.log("[Workflow] Skipping — previous run still active");
    return { skipped: true };
  }
  _workflowRunning = true;

  try {
    const stores = getAllStores().filter(s => s.consumer_key && s.consumer_secret);
    const limit = pLimit(3); // max 3 concurrent store checks
    const results = [];

    console.log(`[Workflow] Checking orders on ${stores.length} stores...`);

    await Promise.all(stores.map(store => limit(async () => {
      try {
        const result = await checkStoreOrders(store);
        if (result) results.push(result);

        // Create alerts for issues
        for (const issue of (result?.issues || [])) {
          // For stuck_processing, alert per order (dedupe by order ID)
          if (issue.type === "stuck_processing") {
            const dedupKey = `workflow_stuck_${store.id}_${issue.orderId}`;
            if (!workflowShouldDedup(dedupKey)) {
              const subject = `Order Stuck: ${store.name} #${issue.orderId} (${issue.daysOld}d)`;
              createAlert({
                subject,
                message: issue.detail,
                storeId: store.id,
                severity: issue.severity,
                type: "workflow",
                dedupKey,
              });
              // Only email for high severity (not backorder items)
              if (issue.severity === "high") {
                queueAlertEmail(subject, issue.detail, store.id, "workflow");
              }
            }
          } else {
            // Batch alerts (pending, on-hold, failed) — one per store per type
            const dedupKey = `workflow_${issue.type}_${store.id}`;
            if (!workflowShouldDedup(dedupKey)) {
              const subject = `Workflow Alert: ${store.name} — ${issue.detail}`;
              createAlert({
                subject,
                message: issue.detail,
                storeId: store.id,
                severity: issue.severity,
                type: "workflow",
                dedupKey,
              });
              if (issue.severity === "high") {
                queueAlertEmail(subject, issue.detail, store.id, "workflow");
              }
            }
          }
        }
      } catch (err) {
        console.error(`[Workflow] Error checking ${store.name}: ${err.message}`);
      }
    })));

    const totalIssues = results.reduce((sum, r) => sum + (r?.issues?.length || 0), 0);
    console.log(`[Workflow] Done. ${results.length} stores checked, ${totalIssues} issues found`);
    return { checked: results.length, issues: totalIssues, results };
  } finally {
    _workflowRunning = false;
  }
}

module.exports = { checkStoreOrders, checkAllStoreOrders };
