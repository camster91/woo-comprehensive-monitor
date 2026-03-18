const { Router } = require("express");
const { createAlert, shouldDeduplicate, queueAlertEmail } = require("../services/alert-service");
const { upsertStore, findStoreByUrl, getStoreStats, updateStoreStats, touchStore } = require("../services/store-service");
const { upsertDispute } = require("../services/dispute-service");
const { run } = require("../db");
const crypto = require("crypto");
const TRACKING_SECRET = process.env.TRACKING_SECRET || "";

const router = Router();

const VALID_TYPES = new Set([
  "dispute_created",
  "dispute_updated",
  "dispute_closed",
  "health_check_critical",
  "plugin_activated",
  "plugin_deactivated",
  "subscription_cancelled",
  "subscription_converted",
  "subscription_price_adjustment",
  "admin_notice",
  "heartbeat",
  "javascript_error",
  "checkout_error",
  "ajax_add_to_cart_error",
  "cart_abandonment_stats",
  "support_ticket",
]);

router.post("/track-woo-error", async (req, res) => {
  try {
    // HMAC signature verification (when TRACKING_SECRET is configured)
    if (TRACKING_SECRET) {
      const sig = req.headers["x-wcm-signature"];
      if (!sig || !req.rawBody) {
        return res.status(401).json({ success: false, error: "Missing signature" });
      }
      const expected = crypto.createHmac("sha256", TRACKING_SECRET).update(req.rawBody).digest("hex");
      const sigBuf = Buffer.from(sig, "hex");
      const expectedBuf = Buffer.from(expected, "hex");
      if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
        return res.status(401).json({ success: false, error: "Invalid signature" });
      }
    }

    const { type, error_message, site, url, time } = req.body;

    // Reject unknown/missing event types to prevent junk alerts
    if (!type || !VALID_TYPES.has(type)) {
      return res.status(400).json({ success: false, error: `Unknown event type: "${type}"` });
    }

    // Resolve store from URL — uses cached store list (no DB scan per request)
    // Check both 'site' and 'store_url' fields (plugin sends store_url for disputes)
    const siteObj = findStoreByUrl(site || req.body.store_url);
    const storeId = siteObj?.id || null;
    if (storeId) touchStore(storeId);

    // --- Dispute created ---
    if (type === "dispute_created") {
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

      // Set auto-submit timer if evidence was generated
      if (req.body.evidence_generated) {
        const { setAutoSubmitAt } = require("../services/dispute-service");
        const submitAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        setAutoSubmitAt(req.body.dispute_id, submitAt);
      }

      const subject = `DISPUTE: ${req.body.dispute_id} on ${req.body.store_name}`;
      const message = [
        `New Stripe dispute detected!`,
        `Store: ${req.body.store_name}`,
        `Dispute ID: ${req.body.dispute_id}`,
        `Order #: ${req.body.order_id}`,
        `Customer: ${req.body.customer_name} (${req.body.customer_email})`,
        `Amount: $${req.body.amount} ${req.body.currency}`,
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

    // --- Dispute updated ---
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

    // --- Dispute closed (won/lost) ---
    if (type === "dispute_closed") {
      const closedStatus = req.body.won ? "won" : "lost";
      upsertDispute({
        stripeDisputeId: req.body.dispute_id,
        status: closedStatus,
        metadata: req.body.metadata,
      });

      const subject = `DISPUTE ${closedStatus.toUpperCase()}: ${req.body.dispute_id} on ${req.body.store_name || "Unknown"}`;
      const message = `Dispute ${req.body.dispute_id} has been ${closedStatus}.\nAmount: $${req.body.amount || "?"} ${req.body.currency || ""}`;
      createAlert({ subject, message, storeId, severity: closedStatus === "won" ? "success" : "high", type: "dispute" });
      if (closedStatus === "lost") {
        queueAlertEmail(subject, message, storeId, "dispute");
      }
      return res.json({ success: true });
    }

    // --- Health check critical ---
    if (type === "health_check_critical") {
      const subject = `HEALTH CHECK CRITICAL: ${req.body.store_name}`;
      let message = `Critical health issues detected!\nStore: ${req.body.store_name}\nURL: ${req.body.store_url}\n\nCritical Issues:\n`;
      (req.body.critical_checks || []).forEach((check, i) => {
        message += `${i + 1}. ${check.name}\n`;
        Object.entries(check.details || {}).forEach(([key, val]) => {
          message += `   - ${key}: ${val}\n`;
        });
      });
      const matchedStore = findStoreByUrl(req.body.store_url);
      createAlert({
        subject,
        message,
        storeId: matchedStore?.id || null,
        severity: "critical",
        type: "health",
      });
      queueAlertEmail(subject, message, matchedStore?.id || null, "health");
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
      touchStore(req.body.store_id);
      if (req.body.features) {
        updateStoreStats(req.body.store_id, { features: req.body.features });
      }
      const subject = `PLUGIN ACTIVATED: ${req.body.store_name}`;
      const message = `Store: ${req.body.store_name}\nURL: ${req.body.store_url}\nPlugin: ${req.body.plugin_version}\nWooCommerce: ${req.body.woocommerce_version}`;
      createAlert({ subject, message, storeId: req.body.store_id, severity: "success", type: "lifecycle" });
      // No email for activation — just informational
      return res.json({ success: true });
    }

    // --- Plugin deactivated ---
    if (type === "plugin_deactivated") {
      const subject = `PLUGIN DEACTIVATED: ${req.body.store_name}`;
      const message = `Store: ${req.body.store_name}\nURL: ${req.body.store_url}\nTime: ${req.body.timestamp}`;
      createAlert({ subject, message, storeId: storeId || null, severity: "warning", type: "lifecycle" });
      return res.json({ success: true });
    }

    // --- Subscription cancelled ---
    if (type === "subscription_cancelled") {
      const subject = `Subscription Cancelled: ${req.body.store_name}`;
      const message = `Subscription #${req.body.subscription_id}\nCustomer: ${req.body.customer_name} (${req.body.customer_email})\nProduct: ${req.body.product_name}\nTotal: ${req.body.total}\nCancelled By: ${req.body.cancelled_by}`;
      const matchedStore = findStoreByUrl(req.body.store_url);
      createAlert({
        subject,
        message,
        storeId: matchedStore?.id || null,
        severity: "medium",
        type: "subscription",
      });
      return res.json({ success: true });
    }

    // --- Subscription converted to one-time ---
    if (type === "subscription_converted") {
      const subject = `Subscription Converted: ${req.body.store_name}`;
      const message = [
        `Customer converted subscription to one-time purchase.`,
        `Store: ${req.body.store_name}`,
        `Customer: ${req.body.customer_name} (${req.body.customer_email})`,
        `Product: ${req.body.product_name}`,
        `Subscription Price: $${req.body.subscription_price}`,
        `Regular Price: $${req.body.regular_price}`,
        `Difference Charged: $${req.body.difference_charged}`,
      ].join("\n");
      createAlert({ subject, message, storeId, severity: "medium", type: "subscription" });
      return res.json({ success: true });
    }

    // --- Subscription price adjustment ---
    if (type === "subscription_price_adjustment") {
      const status = req.body.status === "charged" ? "charged" : "pending";
      const subject = `Price Adjustment (${status}): ${req.body.store_name}`;
      const message = `Subscription #${req.body.subscription_id}\nAmount: ${req.body.amount}\nStatus: ${req.body.status}\nTrigger: ${req.body.trigger}\nTime: ${req.body.timestamp}`;
      const severity = req.body.status === "charged" ? "success" : "high";
      const matchedStore = findStoreByUrl(req.body.store_url);
      createAlert({
        subject,
        message,
        storeId: matchedStore?.id || null,
        severity,
        type: "subscription",
      });
      return res.json({ success: true });
    }

    // --- Admin notice ---
    if (type === "admin_notice") {
      const stats = getStoreStats(req.body.store_id);
      const notices = stats?.admin_notices || [];
      notices.unshift({
        type: req.body.notice_type,
        message: req.body.message,
        timestamp: req.body.timestamp,
      });
      if (notices.length > 20) notices.length = 20;
      updateStoreStats(req.body.store_id, { adminNotices: notices });

      const subject = `Admin Notice: ${req.body.notice_type} on ${req.body.store_name}`;
      createAlert({
        subject,
        message: req.body.message || "No details",
        storeId: req.body.store_id,
        severity: "medium",
        type: "admin_notice",
      });
      return res.json({ success: true });
    }

    // --- Heartbeat (lightweight keepalive from the plugin health cron) ---
    if (type === "heartbeat") {
      // touchStore already called above if store was found by URL
      if (!storeId) {
        // Store not found — register it minimally so last_seen is tracked
        const { upsertStore } = require("../services/store-service");
        if (req.body.store_id && req.body.store_name && req.body.store_url) {
          upsertStore({ id: req.body.store_id, name: req.body.store_name, url: req.body.store_url });
        }
      }
      return res.json({ success: true });
    }

    // --- Cart abandonment stats ---
    if (type === "cart_abandonment_stats") {
      const count = parseInt(req.body.abandoned_count) || 0;
      const date = new Date().toISOString().split("T")[0];
      if (storeId && count >= 0) {
        run(
          `UPDATE revenue_snapshots SET abandoned_carts = ? WHERE store_id = ? AND date = ?`,
          [count, storeId, date]
        );
      }
      return res.json({ success: true });
    }

    // --- Support ticket from chat widget ---
    if (type === "support_ticket") {
      const ticketService = require("../services/ticket-service");
      // Find or create a portal user for this customer
      const { get: dbGet } = require("../db");
      let portalUserId = null;
      const portalUser = dbGet("SELECT id FROM portal_users WHERE email = ?", [req.body.customer_email]);
      if (portalUser) portalUserId = portalUser.id;

      const ticketId = ticketService.createTicket({
        storeId: storeId,
        portalUserId: portalUserId,
        subject: req.body.subject || "Support Request",
        message: req.body.message || req.body.error_message || "No message",
        priority: req.body.priority || "normal",
      });

      // Also create an alert so admin sees it
      createAlert({
        subject: `Support Ticket: ${req.body.customer_name || "Customer"} on ${req.body.store_name || "Unknown"}`,
        message: `${req.body.customer_name} (${req.body.customer_email}): ${req.body.subject}`,
        storeId: storeId,
        severity: "medium",
        type: "ticket",
      });

      return res.json({ success: true, ticket_id: ticketId });
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
    createAlert({ subject, message, storeId, severity, type: "error", dedupKey });
    queueAlertEmail(subject, message, storeId, type);

    return res.json({ success: true });
  } catch (err) {
    console.error("[Tracking Error]", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
