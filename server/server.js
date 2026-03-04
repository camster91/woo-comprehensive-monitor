require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const cron = require("node-cron");
const WooCommerceRestApi = require("@woocommerce/woocommerce-rest-api").default;
const fs = require("fs");
const path = require("path");

// WP Subscription Integration
const {
  initializeWPSubscriptionMonitoring,
  runWPSubscriptionChecks
} = require("./wp-subscription-integration.js");

// Load sites configuration
let sites = [];
let wpsMonitors = [];
let alertHistory = [];

try {
  if (fs.existsSync("./sites.json")) {
    sites = require("./sites.json");
    console.log(`Loaded ${sites.length} site(s) from sites.json`);
    initializeWPSubscriptionMonitors();
  } else {
    console.warn("⚠️  sites.json not found. Backend health checks will be disabled.");
  }
} catch (error) {
  console.error("Error loading sites.json:", error.message);
}

async function initializeWPSubscriptionMonitors() {
  try {
    const wooCommerceAPIs = sites.map(site => new WooCommerceRestApi({
      url: site.url,
      consumerKey: site.consumerKey,
      consumerSecret: site.consumerSecret,
      version: "wc/v3",
    }));
    wpsMonitors = await initializeWPSubscriptionMonitoring(sites, sendAlert, wooCommerceAPIs);
    console.log(`✅ WP Subscription monitoring initialized for ${wpsMonitors.length} site(s)`);
  } catch (error) {
    console.error("Failed to initialize WP Subscription monitoring:", error.message);
  }
}

const app = express();
app.use(cors());
app.use(express.json());

// API Key authentication middleware for protected endpoints
const apiKeyMiddleware = (req, res, next) => {
  // Always allow GET requests (read-only)
  if (req.method === 'GET') {
    return next();
  }
  
  // Always allow error tracking endpoint (POST from stores)
  if (req.path === '/api/track-woo-error') {
    return next();
  }
  
  // Check API key for all other non-GET requests
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;
  const validApiKey = process.env.API_KEY;
  
  if (!validApiKey) {
    // If no API key is configured, allow access (development mode)
    console.warn('⚠️  API_KEY not configured in .env - skipping authentication');
    return next();
  }
  
  if (!apiKey || apiKey !== validApiKey) {
    return res.status(401).json({ error: 'Invalid or missing API key' });
  }
  
  next();
};

app.use(apiKeyMiddleware);

// ==========================================
// 1. EMAIL ALERTING SYSTEM (Mailgun API)
// ==========================================
async function sendAlert(subject, message, siteId = null, severity = "medium") {
  if (!process.env.MAILGUN_API_KEY || !process.env.MAILGUN_DOMAIN) {
    console.log("\n" + "=".repeat(50));
    console.log(`🔕 [MOCKED ALERT - MAILGUN NOT CONFIGURED]`);
    console.log(`SUBJECT: ${subject}`);
    console.log(`MESSAGE:\n${message}`);
    console.log("=".repeat(50) + "\n");

    alertHistory.unshift({ timestamp: new Date().toISOString(), subject, message, siteId, severity });
    if (alertHistory.length > 100) alertHistory.pop();
    return;
  }

  try {
    const mailFrom = process.env.MAIL_FROM || `WooMonitor Alert <alerts@${process.env.MAILGUN_DOMAIN}>`;

    await axios.post(
      `https://api.mailgun.net/v3/${process.env.MAILGUN_DOMAIN}/messages`,
      new URLSearchParams({
        from: mailFrom,
        to: process.env.ALERT_EMAIL,
        subject: `🚨 ${subject}`,
        text: message,
      }),
      { auth: { username: "api", password: process.env.MAILGUN_API_KEY } }
    );
    console.log(`[Alert Sent via Mailgun] ${subject}`);

    alertHistory.unshift({ timestamp: new Date().toISOString(), subject, message, siteId, severity });
    if (alertHistory.length > 100) alertHistory.pop();
  } catch (error) {
    console.error("Failed to send email alert:", error.response?.data?.message || error.message);
  }
}

// ==========================================
// 2. FRONTEND ERROR TRACKING ENDPOINT
// ==========================================
app.post("/api/track-woo-error", async (req, res) => {
  const { type, error_message, site, url, user_agent, customer_email, order_id, time } = req.body;

  // --- Dispute alerts ---
  if (type === 'dispute_created') {
    const subject = `🚨 DISPUTE: ${req.body.dispute_id} on ${req.body.store_name}`;
    const message = `New Stripe dispute detected!\n\n` +
      `Store: ${req.body.store_name}\n` +
      `Dispute ID: ${req.body.dispute_id}\n` +
      `Order ID: ${req.body.order_id}\n` +
      `Customer: ${req.body.customer_email}\n` +
      `Amount: ${req.body.amount} ${req.body.currency}\n` +
      `Reason: ${req.body.reason}\n` +
      `Evidence Generated: ${req.body.evidence_generated ? 'Yes' : 'No'}\n` +
      `Time: ${req.body.timestamp}`;

    const siteObj = sites.find(s => s.url.includes(req.body.store_url) || req.body.store_url.includes(s.url));
    await sendAlert(subject, message, siteObj ? siteObj.id : null, "critical");
    return res.status(200).json({ success: true });
  }

  // --- Health check alerts ---
  if (type === 'health_check_critical') {
    const subject = `🚨 HEALTH CHECK CRITICAL: ${req.body.store_name}`;
    let message = `Critical health issues detected!\n\nStore: ${req.body.store_name}\nURL: ${req.body.store_url}\nTime: ${req.body.timestamp}\n\nCritical Issues:\n`;
    (req.body.critical_checks || []).forEach((check, i) => {
      message += `${i + 1}. ${check.name}\n`;
      Object.entries(check.details || {}).forEach(([key, value]) => { message += `   - ${key}: ${value}\n`; });
      message += '\n';
    });

    const siteObj = sites.find(s => s.url.includes(req.body.store_url) || req.body.store_url.includes(s.url));
    await sendAlert(subject, message, siteObj ? siteObj.id : null, "critical");
    return res.status(200).json({ success: true });
  }

  // --- Plugin activated ---
  if (type === 'plugin_activated') {
    const subject = `✅ PLUGIN ACTIVATED: ${req.body.store_name}`;
    const message = `WooCommerce Comprehensive Monitor activated!\n\n` +
      `Store: ${req.body.store_name}\nStore ID: ${req.body.store_id}\nURL: ${req.body.store_url}\n` +
      `Plugin Version: ${req.body.plugin_version}\nWooCommerce: ${req.body.woocommerce_version}\n` +
      `WordPress: ${req.body.wordpress_version}\nPHP: ${req.body.php_version}\nTime: ${req.body.timestamp}`;

    const existingStore = sites.find(s => s.url === req.body.store_url);
    if (!existingStore) {
      const newStore = { id: req.body.store_id, name: req.body.store_name, url: req.body.store_url };
      // Include API credentials if provided (from dashboard add-store form)
      if (req.body.consumerKey) newStore.consumerKey = req.body.consumerKey;
      if (req.body.consumerSecret) newStore.consumerSecret = req.body.consumerSecret;
      sites.push(newStore);
      try {
        fs.writeFileSync('./sites.json', JSON.stringify(sites, null, 2));
        console.log(`✅ Added new store to monitoring: ${req.body.store_name}`);
      } catch (err) {
        console.error('Failed to save sites.json:', err.message);
      }
    }
    await sendAlert(subject, message, req.body.store_id, "success");
    return res.status(200).json({ success: true });
  }

  // --- Plugin deactivated ---
  if (type === 'plugin_deactivated') {
    const subject = `❌ PLUGIN DEACTIVATED: ${req.body.store_name}`;
    const message = `WooCommerce Comprehensive Monitor deactivated.\n\nStore: ${req.body.store_name}\nStore ID: ${req.body.store_id}\nURL: ${req.body.store_url}\nTime: ${req.body.timestamp}`;
    await sendAlert(subject, message, req.body.store_id, "warning");
    return res.status(200).json({ success: true });
  }

  // --- Subscription cancelled ---
  if (type === 'subscription_cancelled') {
    const subject = `🔄 SUBSCRIPTION CANCELLED: ${req.body.store_name}`;
    const message = `Subscription cancelled.\n\nStore: ${req.body.store_name}\nSubscription: ${req.body.subscription_id}\nCustomer: ${req.body.customer_name} (${req.body.customer_email})\nProduct: ${req.body.product_name}\nAmount: ${req.body.total}\nCancelled by: ${req.body.cancelled_by}\nTime: ${req.body.timestamp}`;
    const siteObj = sites.find(s => s.url.includes(req.body.store_url) || req.body.store_url.includes(s.url));
    await sendAlert(subject, message, siteObj ? siteObj.id : null, "medium");
    return res.status(200).json({ success: true });
  }

  // --- Subscription price adjustment (from Subscription Protector) ---
  if (type === 'subscription_price_adjustment') {
    const triggers = { cancel_auto: 'Auto (cancellation)', convert_customer: 'Customer conversion', admin_manual: 'Admin manual' };
    const triggerLabel = triggers[req.body.trigger] || req.body.trigger;
    const emoji = req.body.status === 'charged' ? '💰' : '⏳';
    const subject = `${emoji} PRICE ADJUSTMENT: ${req.body.store_name} — $${req.body.amount}`;
    const message = `Subscription price adjustment.\n\nStore: ${req.body.store_name}\nSubscription: #${req.body.subscription_id}\nAmount: $${req.body.amount}\nStatus: ${req.body.status}\nTrigger: ${triggerLabel}\nTime: ${req.body.timestamp}`;
    const siteObj = sites.find(s => s.url.includes(req.body.store_url) || req.body.store_url.includes(s.url));
    const severity = req.body.status === 'charged' ? 'success' : 'medium';
    await sendAlert(subject, message, siteObj ? siteObj.id : null, severity);
    return res.status(200).json({ success: true });
  }

  // --- Regular frontend error tracking ---
  const subject = `Frontend Issue on ${site}: ${type}`;
  const message = `A customer just hit a frontend issue!\nSite: ${site}\nURL: ${url || 'Unknown'}\nError Type: ${type}\nError Message: ${error_message}\nTime: ${time || new Date().toISOString()}`;

  try {
    const siteObj = sites.find(s => s.url.includes(site) || (site && site.includes(s.url)));
    await sendAlert(subject, message, siteObj ? siteObj.id : null, "high");
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error(`[Frontend Error] Failed to send alert:`, error.message);
    return res.status(500).json({ success: false, error: "Failed to process error alert" });
  }
});

// ==========================================
// 3. HEALTH CHECK ENDPOINT
// ==========================================
app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "2.1.0",
    features: {
      frontend_monitoring: true,
      backend_health_checks: sites.length > 0,
      email_alerts: !!process.env.MAILGUN_API_KEY && !!process.env.MAILGUN_DOMAIN,
      dashboard_api: true,
      sites_monitored: sites.length
    }
  });
});

// ==========================================
// 4. DASHBOARD API ENDPOINTS
// ==========================================
app.get("/api/dashboard", (req, res) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    overview: {
      totalSites: sites.length,
      criticalAlerts: alertHistory.filter(a => a.severity === "critical").length,
      highAlerts: alertHistory.filter(a => a.severity === "high").length,
      mediumAlerts: alertHistory.filter(a => a.severity === "medium").length,
      totalAlerts: alertHistory.length
    },
    recentAlerts: alertHistory.slice(0, 10),
    stores: sites.map(site => ({ id: site.id, name: site.name, url: site.url }))
  });
});

app.get("/api/dashboard/store/:storeId", (req, res) => {
  const store = sites.find(s => s.id === req.params.storeId);
  if (!store) return res.status(404).json({ error: "Store not found" });
  const storeAlerts = alertHistory.filter(a => a.siteId === req.params.storeId);
  res.status(200).json({
    status: "ok",
    store: { id: store.id, name: store.name, url: store.url },
    alerts: {
      total: storeAlerts.length,
      critical: storeAlerts.filter(a => a.severity === "critical").length,
      high: storeAlerts.filter(a => a.severity === "high").length,
      medium: storeAlerts.filter(a => a.severity === "medium").length,
      recent: storeAlerts.slice(0, 5)
    }
  });
});

app.post("/api/dashboard/clear-alerts", (req, res) => {
  const { storeId, severity, olderThan } = req.body;
  let clearedCount = 0;
  const initialCount = alertHistory.length;

  if (storeId) {
    alertHistory = alertHistory.filter(a => a.siteId !== storeId);
  } else if (severity) {
    alertHistory = alertHistory.filter(a => a.severity !== severity);
  } else if (olderThan) {
    const cutoff = new Date(olderThan);
    alertHistory = alertHistory.filter(a => new Date(a.timestamp) > cutoff);
  } else {
    alertHistory = [];
  }
  clearedCount = initialCount - alertHistory.length;
  res.status(200).json({ status: "ok", message: `Cleared ${clearedCount} alert(s)`, clearedCount, remainingAlerts: alertHistory.length });
});

app.post("/api/reload-sites", (req, res) => {
  try {
    delete require.cache[require.resolve("./sites.json")];
    if (fs.existsSync("./sites.json")) {
      sites = require("./sites.json");
    } else {
      sites = [];
    }
    res.status(200).json({ success: true, message: `Sites reloaded. Now monitoring ${sites.length} site(s).`, sites: sites.length });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to reload sites", message: error.message });
  }
});

app.get("/api/dashboard/alerts", (req, res) => {
  const { storeId, severity, limit = 50, offset = 0 } = req.query;
  let filtered = [...alertHistory];
  if (storeId) filtered = filtered.filter(a => a.siteId === storeId);
  if (severity) filtered = filtered.filter(a => a.severity === severity);
  const paginated = filtered.slice(parseInt(offset), parseInt(offset) + parseInt(limit));
  res.status(200).json({ status: "ok", total: filtered.length, showing: paginated.length, offset: parseInt(offset), limit: parseInt(limit), alerts: paginated });
});

// ==========================================
// STORE MANAGEMENT ENDPOINTS
// ==========================================
app.post("/api/stores/remove", (req, res) => {
  const { storeId } = req.body;
  if (!storeId) return res.status(400).json({ error: "storeId required" });

  const initialCount = sites.length;
  sites = sites.filter(s => s.id !== storeId);

  if (sites.length < initialCount) {
    try {
      fs.writeFileSync('./sites.json', JSON.stringify(sites, null, 2));
      res.status(200).json({ success: true, message: `Store removed. ${sites.length} store(s) remaining.` });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  } else {
    res.status(404).json({ error: "Store not found" });
  }
});

app.patch("/api/stores/:storeId", (req, res) => {
  const store = sites.find(s => s.id === req.params.storeId);
  if (!store) return res.status(404).json({ error: "Store not found" });

  const { name, url, consumerKey, consumerSecret } = req.body;
  if (name) store.name = name;
  if (url) store.url = url;
  if (consumerKey) store.consumerKey = consumerKey;
  if (consumerSecret) store.consumerSecret = consumerSecret;

  try {
    fs.writeFileSync('./sites.json', JSON.stringify(sites, null, 2));
    res.status(200).json({ success: true, store });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/stores", (req, res) => {
  res.status(200).json({
    status: "ok",
    stores: sites.map(s => ({
      id: s.id,
      name: s.name,
      url: s.url,
      hasApiCredentials: !!(s.consumerKey && s.consumerSecret)
    }))
  });
});

app.delete("/api/dashboard/alerts/:index", (req, res) => {
  const index = parseInt(req.params.index);
  if (isNaN(index) || index < 0 || index >= alertHistory.length) return res.status(400).json({ error: "Invalid alert index" });
  const deleted = alertHistory.splice(index, 1)[0];
  res.status(200).json({ status: "ok", message: "Alert deleted", deletedAlert: deleted, remainingAlerts: alertHistory.length });
});

// ==========================================
// 5. DASHBOARD HTML
// ==========================================
// Redirect root to dashboard
app.get("/", (req, res) => res.redirect("/dashboard"));

app.get("/dashboard", (req, res) => {
  try {
    const dashboardPath = path.join(__dirname, 'dashboard-enhanced.html');
    if (fs.existsSync(dashboardPath)) {
      res.send(fs.readFileSync(dashboardPath, 'utf8'));
    } else {
      res.send(`<!DOCTYPE html><html><head><title>WooMonitor Dashboard</title></head><body>
        <h1>WooMonitor Dashboard</h1><p>dashboard-enhanced.html not found. Place it in the project root.</p>
        <p><a href="/api/dashboard">View API JSON</a></p></body></html>`);
    }
  } catch (error) {
    console.error('Error serving dashboard:', error);
    res.status(500).send('Error loading dashboard');
  }
});

// ==========================================
// 6. DEEP HEALTH WOOCOMMERCE MONITOR
// ==========================================
async function checkWooCommerceAPI() {
  if (sites.length === 0) {
    console.log(`[Cron] No sites configured. Skipping backend health checks.`);
    return;
  }

  console.log(`[Cron] Starting Deep Health checks for ${sites.length} site(s)...`);

  for (const site of sites) {
    // Skip sites without API credentials
    if (!site.consumerKey || !site.consumerSecret) {
      console.log(`[Cron] ${site.name}: No API credentials, skipping deep checks.`);
      continue;
    }

    try {
      const api = new WooCommerceRestApi({
        url: site.url,
        consumerKey: site.consumerKey,
        consumerSecret: site.consumerSecret,
        version: "wc/v3",
      });

      // A. ACTION SCHEDULER HEALTH
      const { data: systemStatus } = await api.get("system_status");
      const actionScheduler = systemStatus.environment.action_scheduler_status;
      if (actionScheduler && actionScheduler.failed > 50) {
        await sendAlert(
          `CRITICAL: Background Tasks Failing on ${site.name}`,
          `There are ${actionScheduler.failed} failed background tasks. This usually means WP-Cron is broken, which will stop WooCommerce Subscriptions from renewing automatically! Please check WooCommerce -> Status -> Scheduled Actions.`,
          site.id, "critical"
        );
      }

      // B. STRIPE GATEWAY HEALTH
      const { data: gateways } = await api.get("payment_gateways");
      const stripeGateway = gateways.find(g => g.id === "stripe");
      if (stripeGateway && stripeGateway.enabled === false) {
        await sendAlert(
          `STRIPE DISCONNECTED on ${site.name}`,
          `The Stripe payment gateway is currently DISABLED. Customers cannot check out.`,
          site.id, "critical"
        );
      }

      // C. STRIPE WEBHOOK FAILURES (Pending Payment orders)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();

      const { data: pendingOrders } = await api.get("orders", {
        status: "pending",
        before: oneHourAgo,
        after: threeHoursAgo
      });

      if (pendingOrders.length > 0) {
        await sendAlert(
          `Possible Stripe Webhook Failure on ${site.name}`,
          `${pendingOrders.length} order(s) have been stuck in "Pending Payment" for over an hour. This usually means Stripe charged the customer but the webhook to WooCommerce was blocked.`,
          site.id, "high"
        );
      }

      // D. FAILED ORDERS & SUBSCRIPTION RENEWALS
      const { data: failedOrders } = await api.get("orders", {
        status: "failed",
        after: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      });

      for (const order of failedOrders) {
        const isSubscriptionRenewal = order.meta_data?.some(m => m.key === "_subscription_renewal") || false;
        const typeStr = isSubscriptionRenewal ? "Subscription Renewal" : "Standard Order";
        await sendAlert(
          `${typeStr} Failed on ${site.name}`,
          `Order #${order.id} failed.\nType: ${typeStr}\nCustomer: ${order.billing.email}\nTotal: ${order.total}\nPlease check Stripe for the decline reason.`,
          site.id, "medium"
        );
      }

      // E. SHIPSTATION SYNC HEALTH
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const { data: processingOrders } = await api.get("orders", {
        status: "processing",
        before: twoHoursAgo
      });

      if (processingOrders.length > 0) {
        await sendAlert(
          `ShipStation Sync Failing on ${site.name}`,
          `${processingOrders.length} order(s) have been stuck in Processing for >2 hours and haven't synced to ShipStation. Verify the ShipStation plugin is connected.`,
          site.id, "high"
        );
      }

      console.log(`[Cron] ${site.name}: All checks passed ✅`);

    } catch (error) {
      console.error(`[API Error] ${site.name}:`, error.message);
      await sendAlert(
        `API Disconnected on ${site.name}`,
        `Could not connect to the WooCommerce API on ${site.url}.\nError: ${error.message}\nCheck if the site is down or if a firewall is blocking the REST API.`,
        site.id, "critical"
      );
    }
  }

  console.log(`[Cron] Deep Health checks completed for ${sites.length} site(s).`);
}

// ==========================================
// 7. CRON SCHEDULES
// ==========================================
cron.schedule("*/15 * * * *", checkWooCommerceAPI);

cron.schedule("0 * * * *", () => {
  if (wpsMonitors.length > 0) {
    console.log(`[Cron] Starting WP Subscription checks for ${wpsMonitors.length} site(s)...`);
    runWPSubscriptionChecks(wpsMonitors, sendAlert);
  }
});

// ==========================================
// 8. START THE SERVER
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 WooCommerce Monitor Server v2.1.0`);
  console.log(`📡 Listening on port ${PORT}`);
  console.log(`🌐 Health endpoint: http://localhost:${PORT}/api/health`);
  console.log(`📊 Dashboard: http://localhost:${PORT}/dashboard`);
  console.log(`📨 Error tracking endpoint: http://localhost:${PORT}/api/track-woo-error`);
  console.log(`\n📋 Configuration:`);
  console.log(`   • Sites configured: ${sites.length}`);
  console.log(`   • Mailgun alerts: ${process.env.MAILGUN_API_KEY ? '✅ Enabled' : '❌ Disabled'}`);
  console.log(`   • WP Subscription monitoring: ${wpsMonitors.length > 0 ? '✅ Enabled' : '❌ Disabled'}`);
  console.log(`\n⏰ Scheduled tasks:`);
  console.log(`   • WooCommerce health checks: Every 15 minutes`);
  console.log(`   • WP Subscription checks: Every hour`);
  console.log(`\n✅ Server ready!`);
});

// Run initial health check on startup
setTimeout(() => {
  checkWooCommerceAPI();
}, 10000);
