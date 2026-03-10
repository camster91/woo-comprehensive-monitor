const { Router } = require("express");
const { createAlert, shouldDeduplicate, sendAlertEmail } = require("../services/alert-service");
const { upsertStore, getAllStores, getStoreStats, updateStoreStats, touchStore } = require("../services/store-service");

const router = Router();

router.post("/track-woo-error", async (req, res) => {
  try {
    const { type, error_message, site, url, time } = req.body;

    // Find matching store
    const stores = getAllStores();
    const siteObj = stores.find(s =>
      s.url.includes(site) || (site && site.includes(s.url))
    );
    const storeId = siteObj?.id || null;
    if (storeId) touchStore(storeId);

    // --- Dispute alerts ---
    if (type === "dispute_created") {
      const subject = `DISPUTE: ${req.body.dispute_id} on ${req.body.store_name}`;
      const message = [
        `New Stripe dispute detected!`,
        `Store: ${req.body.store_name}`,
        `Dispute ID: ${req.body.dispute_id}`,
        `Order ID: ${req.body.order_id}`,
        `Customer: ${req.body.customer_email}`,
        `Amount: ${req.body.amount} ${req.body.currency}`,
        `Reason: ${req.body.reason}`,
        `Evidence Generated: ${req.body.evidence_generated ? "Yes" : "No"}`,
        `Time: ${req.body.timestamp}`,
      ].join("\n");
      createAlert({ subject, message, storeId, severity: "critical", type: "dispute" });
      await sendAlertEmail(subject, message);
      return res.json({ success: true });
    }

    // --- Health check critical ---
    if (type === "health_check_critical") {
      const subject = `HEALTH CHECK CRITICAL: ${req.body.store_name}`;
      let message = `Critical health issues detected!\nStore: ${req.body.store_name}\nURL: ${req.body.store_url}\n\nCritical Issues:\n`;
      (req.body.critical_checks || []).forEach((check, i) => {
        message += `${i + 1}. ${check.name}\n`;
        Object.entries(check.details || {}).forEach(([key, val]) => { message += `   - ${key}: ${val}\n`; });
      });
      const matchedStore = stores.find(s => s.url.includes(req.body.store_url) || req.body.store_url?.includes(s.url));
      createAlert({ subject, message, storeId: matchedStore?.id || null, severity: "critical", type: "health" });
      await sendAlertEmail(subject, message);
      return res.json({ success: true });
    }

    // --- Plugin activated ---
    if (type === "plugin_activated") {
      upsertStore({
        id: req.body.store_id,
        name: req.body.store_name,
        url: req.body.store_url,
        consumerKey: req.body.consumerKey,
        consumerSecret: req.body.consumerSecret,
        pluginVersion: req.body.plugin_version,
        woocommerceVersion: req.body.woocommerce_version,
        wordpressVersion: req.body.wordpress_version,
        phpVersion: req.body.php_version,
      });
      if (req.body.features) {
        updateStoreStats(req.body.store_id, { features: req.body.features });
      }
      const subject = `PLUGIN ACTIVATED: ${req.body.store_name}`;
      const message = `Store: ${req.body.store_name}\nURL: ${req.body.store_url}\nPlugin: ${req.body.plugin_version}\nWooCommerce: ${req.body.woocommerce_version}`;
      createAlert({ subject, message, storeId: req.body.store_id, severity: "success", type: "lifecycle" });
      return res.json({ success: true });
    }

    // --- Plugin deactivated ---
    if (type === "plugin_deactivated") {
      const subject = `PLUGIN DEACTIVATED: ${req.body.store_name}`;
      const message = `Store: ${req.body.store_name}\nURL: ${req.body.store_url}\nTime: ${req.body.timestamp}`;
      createAlert({ subject, message, storeId: siteObj?.id || null, severity: "warning", type: "lifecycle" });
      return res.json({ success: true });
    }

    // --- Subscription cancelled ---
    if (type === "subscription_cancelled") {
      const subject = `Subscription Cancelled: ${req.body.store_name}`;
      const message = `Subscription #${req.body.subscription_id}\nCustomer: ${req.body.customer_name} (${req.body.customer_email})\nProduct: ${req.body.product_name}\nTotal: ${req.body.total}\nCancelled By: ${req.body.cancelled_by}`;
      const matchedStore = stores.find(s => s.url.includes(req.body.store_url) || req.body.store_url?.includes(s.url));
      createAlert({ subject, message, storeId: matchedStore?.id || null, severity: "medium", type: "subscription" });
      return res.json({ success: true });
    }

    // --- Subscription price adjustment ---
    if (type === "subscription_price_adjustment") {
      const status = req.body.status === "charged" ? "charged" : "pending";
      const subject = `Price Adjustment (${status}): ${req.body.store_name}`;
      const message = `Subscription #${req.body.subscription_id}\nAmount: ${req.body.amount}\nStatus: ${req.body.status}\nTrigger: ${req.body.trigger}\nTime: ${req.body.timestamp}`;
      const severity = req.body.status === "charged" ? "success" : "high";
      const matchedStore = stores.find(s => s.url.includes(req.body.store_url) || req.body.store_url?.includes(s.url));
      createAlert({ subject, message, storeId: matchedStore?.id || null, severity, type: "subscription" });
      return res.json({ success: true });
    }

    // --- Admin notice ---
    if (type === "admin_notice") {
      const stats = getStoreStats(req.body.store_id);
      const notices = stats?.admin_notices || [];
      notices.unshift({ type: req.body.notice_type, message: req.body.message, timestamp: req.body.timestamp });
      if (notices.length > 20) notices.length = 20;
      updateStoreStats(req.body.store_id, { adminNotices: notices });

      const subject = `Admin Notice: ${req.body.notice_type} on ${req.body.store_name}`;
      createAlert({ subject, message: req.body.message || "No details", storeId: req.body.store_id, severity: "medium", type: "admin_notice" });
      return res.json({ success: true });
    }

    // --- Regular frontend errors ---
    const dedupKey = `error_${site}_${type}_${(error_message || "").substring(0, 50)}`;
    if (shouldDeduplicate(dedupKey)) {
      return res.json({ success: true, deduplicated: true });
    }

    let severity = "high";
    let category = "Frontend Issue";
    if (type === "javascript_error") category = "JavaScript Error";
    else if (type === "checkout_error") { category = "Checkout Error"; severity = "critical"; }
    else if (type === "ajax_add_to_cart_error") category = "Add to Cart Error";

    const subject = `${category} on ${site}: ${type}`;
    const message = `Site: ${site}\nURL: ${url || "Unknown"}\nError: ${error_message}\nTime: ${time || new Date().toISOString()}`;
    createAlert({ subject, message, storeId, severity, type: "error" });
    await sendAlertEmail(subject, message);

    return res.json({ success: true });
  } catch (err) {
    console.error("[Tracking Error]", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
