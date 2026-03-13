/**
 * Health Checker
 *
 * Crash fix: was firing all N stores simultaneously with Promise.allSettled(stores.map(...))
 * With 25 stores this means 25 simultaneous outbound HTTP requests, each potentially
 * taking 5-30 seconds. This created a massive memory and TCP connection spike on startup.
 *
 * Fix: p-limit(5) — at most 5 concurrent health checks at a time.
 */

const WooCommerceRestApi = require("@woocommerce/woocommerce-rest-api").default;
const pLimit = require("p-limit");
const { getAllStores } = require("./store-service");
const { createAlert, shouldDeduplicate, queueAlertEmail } = require("./alert-service");

// Max 5 concurrent outbound HTTP health checks
const limit = pLimit(5);

async function checkStore(store) {
  if (!store.consumer_key || !store.consumer_secret) {
    return { storeId: store.id, status: "skipped", reason: "No API credentials" };
  }

  const api = new WooCommerceRestApi({
    url: store.url,
    consumerKey: store.consumer_key,
    consumerSecret: store.consumer_secret,
    version: "wc/v3",
    timeout: 15000, // 15s timeout per store — don't wait forever
  });

  try {
    const { data } = await api.get("system_status");
    const issues = [];

    // Check Action Scheduler
    const env = data.environment || {};
    if (env.action_scheduler_status) {
      const failed = env.action_scheduler_status.failed || 0;
      if (failed > 100) {
        issues.push({
          check: "action_scheduler",
          severity: "critical",
          detail: `${failed} failed tasks`,
        });
      }
    }

    // Check pending orders
    const db = data.database || {};
    if (db.wc_pending_count > 50) {
      issues.push({
        check: "pending_orders",
        severity: "high",
        detail: `${db.wc_pending_count} pending orders`,
      });
    }

    // Check Stripe is active
    const activePlugins = data.active_plugins || [];
    const stripePlugin = activePlugins.find(
      (p) => p.plugin && p.plugin.includes("stripe")
    );
    if (!stripePlugin) {
      issues.push({
        check: "stripe_gateway",
        severity: "medium",
        detail: "Stripe plugin not active",
      });
    }

    if (issues.length > 0) {
      const subject = `Health Check: ${store.name} — ${issues.length} issue(s)`;
      const message = issues
        .map((i) => `[${i.severity.toUpperCase()}] ${i.check}: ${i.detail}`)
        .join("\n");
      const dedupKey = `health_${store.id}`;
      if (!shouldDeduplicate(dedupKey)) {
        createAlert({
          subject,
          message,
          storeId: store.id,
          severity: issues[0].severity,
          type: "health",
        });
        queueAlertEmail(subject, message, store.id, "health");
      }
    }

    return { storeId: store.id, status: "checked", issues: issues.length };
  } catch (err) {
    return { storeId: store.id, status: "error", error: err.message };
  }
}

async function checkAllStores() {
  const stores = getAllStores();
  console.log(`[Health] Checking ${stores.length} store(s) (max 5 concurrent)...`);

  // Use p-limit to cap at 5 simultaneous outbound HTTP requests
  const results = await Promise.allSettled(
    stores.map((store) => limit(() => checkStore(store)))
  );

  const mapped = results.map((r) =>
    r.status === "fulfilled" ? r.value : { status: "error", error: r.reason?.message }
  );

  const checked = mapped.filter((r) => r.status === "checked").length;
  const skipped = mapped.filter((r) => r.status === "skipped").length;
  const errors = mapped.filter((r) => r.status === "error").length;
  console.log(`[Health] Done. checked=${checked} skipped=${skipped} errors=${errors}`);

  return mapped;
}

module.exports = { checkStore, checkAllStores };
