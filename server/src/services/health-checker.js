const WooCommerceRestApi = require("@woocommerce/woocommerce-rest-api").default;
const { getAllStores } = require("./store-service");
const { createAlert, shouldDeduplicate, sendAlertEmail } = require("./alert-service");

async function checkStore(store) {
  if (!store.consumer_key || !store.consumer_secret) {
    return { storeId: store.id, status: "skipped", reason: "No API credentials" };
  }

  const api = new WooCommerceRestApi({
    url: store.url,
    consumerKey: store.consumer_key,
    consumerSecret: store.consumer_secret,
    version: "wc/v3",
  });

  try {
    const { data } = await api.get("system_status");
    const issues = [];

    // Check Action Scheduler
    const env = data.environment || {};
    if (env.action_scheduler_status) {
      const failed = env.action_scheduler_status.failed || 0;
      if (failed > 100) {
        issues.push({ check: "action_scheduler", severity: "critical", detail: `${failed} failed tasks` });
      }
    }

    // Check database
    const db = data.database || {};
    if (db.wc_pending_count > 50) {
      issues.push({ check: "pending_orders", severity: "high", detail: `${db.wc_pending_count} pending orders` });
    }

    // Check active plugins for Stripe
    const activePlugins = data.active_plugins || [];
    const stripePlugin = activePlugins.find(p => p.plugin && p.plugin.includes("stripe"));
    if (!stripePlugin) {
      issues.push({ check: "stripe_gateway", severity: "medium", detail: "Stripe plugin not active" });
    }

    if (issues.length > 0) {
      const subject = `Health Check: ${store.name} — ${issues.length} issue(s)`;
      const message = issues.map(i => `[${i.severity.toUpperCase()}] ${i.check}: ${i.detail}`).join("\n");
      const dedupKey = `health_${store.id}`;
      if (!shouldDeduplicate(dedupKey)) {
        createAlert({ subject, message, storeId: store.id, severity: issues[0].severity, type: "health" });
        await sendAlertEmail(subject, message);
      }
    }

    return { storeId: store.id, status: "checked", issues: issues.length };
  } catch (err) {
    return { storeId: store.id, status: "error", error: err.message };
  }
}

async function checkAllStores() {
  const stores = getAllStores();
  console.log(`[Health] Checking ${stores.length} store(s)...`);
  const results = await Promise.allSettled(stores.map(checkStore));
  const mapped = results.map(r => r.status === "fulfilled" ? r.value : { status: "error", error: r.reason?.message });
  console.log(`[Health] Done. ${mapped.filter(r => r.status === "checked").length} checked, ${mapped.filter(r => r.status === "skipped").length} skipped.`);
  return mapped;
}

module.exports = { checkStore, checkAllStores };
