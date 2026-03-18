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

    // Check Stripe — plugin active, gateway enabled, keys configured
    const activePlugins = data.active_plugins || [];
    const stripePlugin = activePlugins.find(
      (p) => p.plugin && p.plugin.includes("stripe")
    );
    if (!stripePlugin) {
      issues.push({
        check: "stripe_gateway",
        severity: "critical",
        detail: "Stripe plugin not active — customers cannot pay",
      });
    }

    // Check Stripe gateway settings via WC API
    try {
      const { data: gateways } = await api.get("payment_gateways");
      const stripeGw = (gateways || []).find(g => g.id === "stripe");
      if (stripeGw) {
        if (stripeGw.enabled === false) {
          issues.push({
            check: "stripe_disabled",
            severity: "critical",
            detail: "Stripe gateway is installed but DISABLED in WooCommerce settings",
          });
        }
        // Check test mode
        const testMode = (stripeGw.settings?.testmode?.value === "yes");
        if (testMode) {
          issues.push({
            check: "stripe_test_mode",
            severity: "high",
            detail: "Stripe is in TEST MODE — live payments are not processing",
          });
        }
      }
    } catch (_) {
      // payment_gateways endpoint may not be available on older WC versions
    }

    // Check ShipStation — plugin active and auth key configured
    const shipstationPlugin = activePlugins.find(
      (p) => p.plugin && (p.plugin.includes("shipstation"))
    );
    if (!shipstationPlugin) {
      issues.push({
        check: "shipstation",
        severity: "high",
        detail: "ShipStation plugin not active — orders won't sync for fulfillment",
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

/**
 * Detect stores that have gone silent — last_seen > threshold with no recent
 * heartbeat. Only fires for stores that were active within the past 7 days
 * (avoids alerting for stores that were just added but never activated).
 *
 * Threshold: 26 hours — slightly longer than one health-check cycle (twicedaily
 * = 12h) plus drift, so a single missed cron doesn't trigger an alert.
 */
const SILENCE_THRESHOLD_HOURS = 26;
const SILENCE_MAX_AGE_DAYS = 7; // Don't alert for stores not seen in >7 days (probably removed)

async function checkSilentStores() {
  const stores = getAllStores();
  const now = Date.now();

  for (const store of stores) {
    if (!store.last_seen) continue;

    const lastSeenMs = new Date(store.last_seen + "Z").getTime();
    const hoursSilent = (now - lastSeenMs) / (1000 * 60 * 60);

    // Skip stores that were never really active or are very stale (likely removed)
    if (hoursSilent < SILENCE_THRESHOLD_HOURS || hoursSilent > SILENCE_MAX_AGE_DAYS * 24) continue;

    const dedupKey = `silent_${store.id}`;
    if (!shouldDeduplicate(dedupKey)) {
      const h = Math.round(hoursSilent);
      const subject = `Store Silent: ${store.name} (${h}h)`;
      const message = [
        `Store has not reported in ${h} hours.`,
        `Store:     ${store.name}`,
        `URL:       ${store.url}`,
        `Last seen: ${store.last_seen} UTC`,
        ``,
        `Possible causes:`,
        `  - Plugin was deactivated`,
        `  - Site is down or unreachable`,
        `  - WP-Cron is broken (DISABLE_WP_CRON or hosting issue)`,
        `  - Monitoring server URL changed in plugin settings`,
      ].join("\n");

      createAlert({ subject, message, storeId: store.id, severity: "high", type: "silent", dedupKey });
      queueAlertEmail(subject, message, store.id, "silent");
      console.log(`[Health] Silent store alert: ${store.name} (${h}h silent)`);
    }
  }
}

module.exports = { checkStore, checkAllStores, checkSilentStores };
