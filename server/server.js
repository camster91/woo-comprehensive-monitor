require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const cron = require("node-cron");
const WooCommerceRestApi = require("@woocommerce/woocommerce-rest-api").default;
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// WP Subscription Integration
const {
  initializeWPSubscriptionMonitoring,
  runWPSubscriptionChecks
} = require("./wp-subscription-integration.js");

// Load sites configuration
let sites = [];
let wpsMonitors = [];
let alertHistory = [];

// Error tracking for deduplication and analytics
let errorCounts = {}; // key -> count
let lastAlertTimes = {}; // key -> timestamp

// Authentication store (in-memory, reset on server restart)
let authCodes = {}; // email -> { code, expires }
let authTokens = {}; // token -> { email, expires }
const AUTH_SECRET = process.env.AUTH_SECRET || crypto.randomBytes(32).toString('hex');
const ALLOWED_EMAILS = process.env.ALLOWED_EMAILS ? process.env.ALLOWED_EMAILS.split(',') : ['cameron@ashbi.ca'];
const REQUIRE_AUTH = process.env.REQUIRE_AUTH !== 'false'; // default true

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
  
  // Check if request has valid auth token (from dashboard)
  const authToken = req.headers['x-auth-token'] || req.query.authToken;
  if (authToken && authTokens[authToken]) {
    const authData = authTokens[authToken];
    if (authData.expires >= Date.now()) {
      // Valid auth token, allow request
      req.user = authData.email;
      return next();
    } else {
      // Expired token, clean up
      delete authTokens[authToken];
    }
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

// Authentication middleware for dashboard access
const authMiddleware = (req, res, next) => {
  // Skip auth if not required
  if (!REQUIRE_AUTH) {
    return next();
  }
  
  // Allow auth endpoints without authentication
  if (req.path.startsWith('/api/auth/')) {
    return next();
  }
  
  // Allow plugin download without auth
  if (req.path === '/download/plugin') {
    return next();
  }
  
  // Allow health endpoint without auth
  if (req.path === '/api/health') {
    return next();
  }
  
  // Allow error tracking endpoint without auth (plugin reports)
  if (req.path === '/api/track-woo-error') {
    return next();
  }
  
  // Check for valid token (from header or query parameter)
  const token = req.headers['x-auth-token'] || req.query.authToken;
  
  if (!token || !authTokens[token]) {
    // No valid token, but apiKeyMiddleware may have allowed with API key
    // For dashboard HTML route, we'll handle in the route itself
    return next();
  }
  
  // Check token expiry
  const authData = authTokens[token];
  if (authData.expires < Date.now()) {
    delete authTokens[token];
    return next();
  }
  
  // Token is valid, attach user to request
  req.user = authData.email;
  next();
};

// Apply auth middleware to all routes (except static assets)
app.use(authMiddleware);

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
      const newStore = { 
        id: req.body.store_id, 
        name: req.body.store_name, 
        url: req.body.store_url,
        plugin_version: req.body.plugin_version,
        woocommerce_version: req.body.woocommerce_version,
        last_seen: new Date().toISOString()
      };
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
    } else {
      // Update existing store with new ID and version
      existingStore.id = req.body.store_id;
      existingStore.plugin_version = req.body.plugin_version;
      existingStore.woocommerce_version = req.body.woocommerce_version;
      existingStore.last_seen = new Date().toISOString();
      try {
        fs.writeFileSync('./sites.json', JSON.stringify(sites, null, 2));
        console.log(`✅ Updated existing store: ${req.body.store_name} to v${req.body.plugin_version}`);
      } catch (err) {
        console.error('Failed to save sites.json:', err.message);
      }
    }
    
    // Update store stats
    updateStoreStats(req.body.store_id, {
      plugin_version: req.body.plugin_version,
      woocommerce_version: req.body.woocommerce_version,
      features: req.body.features || {}
    });
    
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

  // --- Admin notices (plugin warnings, errors, etc.) ---
  if (type === 'admin_notice') {
    const noticeTypes = {
      'stripe_missing': '⚠️ Stripe Missing',
      'stripe_disabled': '⚠️ Stripe Disabled',
      'activation_error': '❌ Activation Error',
      'compatibility_warning': '⚠️ Compatibility Warning'
    };
    const noticeLabel = noticeTypes[req.body.notice_type] || req.body.notice_type || 'Admin Notice';
    const subject = `${noticeLabel} on ${req.body.store_name}`;
    const message = `Admin notice from plugin.\n\nStore: ${req.body.store_name}\nURL: ${req.body.store_url}\nNotice Type: ${req.body.notice_type}\nMessage: ${req.body.message}\nPlugin Version: ${req.body.plugin_version}\nWooCommerce: ${req.body.woocommerce_version}\nWordPress: ${req.body.wordpress_version}\nPHP: ${req.body.php_version}\nTime: ${req.body.timestamp}`;
    
    // Store admin notice for dashboard
    const siteObj = sites.find(s => s.url.includes(req.body.store_url) || req.body.store_url.includes(s.url));
    if (siteObj) {
      // Add to store stats
      if (!storeStats[req.body.store_id]) {
        updateStoreStats(req.body.store_id, {
          plugin_version: req.body.plugin_version,
          woocommerce_version: req.body.woocommerce_version
        });
      }
      if (!storeStats[req.body.store_id].admin_notices) {
        storeStats[req.body.store_id].admin_notices = [];
      }
      storeStats[req.body.store_id].admin_notices.unshift({
        type: req.body.notice_type,
        message: req.body.message,
        timestamp: req.body.timestamp
      });
      // Keep only last 20 notices
      if (storeStats[req.body.store_id].admin_notices.length > 20) {
        storeStats[req.body.store_id].admin_notices.pop();
      }
    }
    
    // Send alert
    await sendAlert(subject, message, siteObj ? siteObj.id : null, "medium");
    return res.status(200).json({ success: true });
  }

  // --- Regular frontend error tracking ---
  
  // Find store by URL for plugin version and ID
  const siteObj = sites.find(s => s.url.includes(site) || (site && site.includes(s.url)));
  const storeId = siteObj?.id;
  const pluginVersion = storeId ? storeStats[storeId]?.plugin_version : 'unknown';
  
  // Store error for analytics and deduplication
  const errorKey = `error_${site}_${type}_${error_message.substring(0, 50).replace(/\s+/g, '_')}`;
  const errorCount = errorCounts[errorKey] || 0;
  errorCounts[errorKey] = errorCount + 1;
  
  // Determine severity based on error type and count
  let severity = "high";
  let category = "Frontend Issue";
  
  if (type === 'javascript_error') {
    // Check for common jQuery errors
    if (error_message.includes('jQuery') || error_message.includes('$ is not defined') || error_message.includes('Cannot read property')) {
      category = "jQuery Compatibility Issue";
    } else if (error_message.includes('Uncaught TypeError')) {
      category = "JavaScript Type Error";
    }
    
    // If this error has occurred many times, lower severity (likely a known issue)
    if (errorCount > 10) {
      severity = "medium";
    }
  } else if (type === 'checkout_error') {
    category = "Checkout Error";
    severity = "critical"; // Checkout errors are critical
  } else if (type === 'ajax_add_to_cart_error') {
    category = "Add to Cart Error";
    severity = "high";
  }
  
  const subject = `${category} on ${site}: ${type}`;
  let message = `A customer just hit a frontend issue!\n\n`;
  message += `Site: ${site}\n`;
  message += `URL: ${url || 'Unknown'}\n`;
  message += `Error Type: ${type}\n`;
  message += `Error Message: ${error_message}\n`;
  message += `Time: ${time || new Date().toISOString()}\n`;
  message += `Occurrences: ${errorCount} (including this one)\n\n`;
  
  // Add diagnostic suggestions based on error type
  message += `--- DIAGNOSTIC SUGGESTIONS ---\n`;
  
  if (type === 'javascript_error') {
    message += `1. Check for jQuery conflicts with other plugins/themes\n`;
    message += `2. Test with default theme and disabled plugins\n`;
    message += `3. Clear browser and WordPress cache\n`;
    message += `4. Check browser console for full error details\n`;
  } else if (type === 'checkout_error') {
    message += `1. Test checkout with different payment methods\n`;
    message += `2. Check WooCommerce error logs\n`;
    message += `3. Verify payment gateway settings\n`;
    message += `4. Test with a simple product\n`;
  } else if (type === 'ajax_add_to_cart_error') {
    message += `1. Check product stock and variations\n`;
    message += `2. Test with different browsers\n`;
    message += `3. Check for JavaScript conflicts\n`;
    message += `4. Verify product pricing and settings\n`;
  }
  
  message += `\n--- NEXT STEPS ---\n`;
  message += `1. View error details in dashboard: https://woo.ashbi.ca/dashboard\n`;
  message += `2. Use AI Chat for diagnosis: https://woo.ashbi.ca/dashboard → "💬 DeepSeek Chat"\n`;
  message += `3. Check WordPress error logs: wp-content/debug.log\n`;
  message += `4. Update plugin to latest version (currently ${pluginVersion})\n`;
  
  // If error has occurred many times, suggest suppression
  if (errorCount > 20) {
    message += `\n⚠️ This error has occurred ${errorCount} times. Consider:\n`;
    message += `- Adding error suppression in plugin settings\n`;
    message += `- Investigating root cause with developer\n`;
    message += `- Checking for plugin conflicts\n`;
  }

  try {
    
    // Only send alert if:
    // 1. First occurrence, OR
    // 2. Critical/High severity, OR  
    // 3. Been more than 1 hour since last alert for this error
    const lastAlertKey = `last_alert_${errorKey}`;
    const lastAlertTime = lastAlertTimes[lastAlertKey] || 0;
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    
    if (errorCount === 1 || severity === "critical" || severity === "high" || (now - lastAlertTime) > oneHour) {
      await sendAlert(subject, message, siteObj ? siteObj.id : null, severity);
      lastAlertTimes[lastAlertKey] = now;
    } else {
      console.log(`[Frontend Error] Skipping alert for ${errorKey} (occurrence ${errorCount}, last alert ${Math.round((now - lastAlertTime) / 1000 / 60)} minutes ago)`);
    }
    
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
    version: "2.4.0",
    features: {
      frontend_monitoring: true,
      backend_health_checks: sites.length > 0,
      email_alerts: !!process.env.MAILGUN_API_KEY && !!process.env.MAILGUN_DOMAIN,
      dashboard_api: true,
      store_statistics: true,
      feature_tracking: true,
      sites_monitored: sites.length
    }
  });
});

// ==========================================
// 4. ENHANCED STORE DATA TRACKING
// ==========================================
// Store detailed statistics for each connected store
const storeStats = {};

// Initialize store stats from existing sites
sites.forEach(site => {
  if (site.id && !storeStats[site.id]) {
    storeStats[site.id] = {
      plugin_version: site.plugin_version || 'unknown',
      woocommerce_version: site.woocommerce_version || 'unknown',
      last_seen: site.last_seen || new Date().toISOString(),
      features: site.features || {},
      alerts: {
        total: 0,
        errors: 0,
        disputes: 0,
        preorders: 0,
        price_adjustments: 0,
        health_critical: 0
      },
      admin_notices: []
    };
  }
});

// Update store stats when we receive events
function updateStoreStats(storeId, data) {
  if (!storeStats[storeId]) {
    storeStats[storeId] = {
      plugin_version: data.plugin_version || 'unknown',
      woocommerce_version: data.woocommerce_version || 'unknown',
      last_seen: new Date().toISOString(),
      features: {},
      alerts: {
        total: 0,
        errors: 0,
        disputes: 0,
        preorders: 0,
        price_adjustments: 0,
        health_critical: 0
      },
      admin_notices: []
    };
  }
  
  // Update basic info
  if (data.plugin_version) storeStats[storeId].plugin_version = data.plugin_version;
  if (data.woocommerce_version) storeStats[storeId].woocommerce_version = data.woocommerce_version;
  storeStats[storeId].last_seen = new Date().toISOString();
  
  // Track features if reported
  if (data.features) {
    storeStats[storeId].features = { ...storeStats[storeId].features, ...data.features };
  }
}

// ==========================================
// 5. DASHBOARD API ENDPOINTS
// ==========================================
app.get("/api/dashboard", (req, res) => {
  const enhancedStores = sites.map(site => {
    const stats = storeStats[site.id] || {};
    const siteAlerts = alertHistory.filter(a => a.siteId === site.id);
    
    // Count alerts by type for this store
    const errorAlerts = siteAlerts.filter(a => 
      a.subject && a.subject.includes('Frontend Issue') || 
      a.subject && a.subject.includes('health_check')
    ).length;
    const disputeAlerts = siteAlerts.filter(a => 
      a.subject && a.subject.includes('DISPUTE')
    ).length;
    const preorderAlerts = siteAlerts.filter(a => 
      a.subject && (a.subject.includes('PRE-ORDER') || a.subject.includes('preorder'))
    ).length;
    const priceAdjustmentAlerts = siteAlerts.filter(a => 
      a.subject && a.subject.includes('PRICE ADJUSTMENT')
    ).length;
    
    return {
      id: site.id,
      name: site.name,
      url: site.url,
      consumerKey: site.consumerKey || null,
      consumerSecret: site.consumerSecret || null,
      plugin_version: stats.plugin_version || 'unknown',
      woocommerce_version: stats.woocommerce_version || 'unknown',
      last_seen: stats.last_seen || site.last_seen || null,
      features: stats.features || {},
      alert_counts: {
        total: siteAlerts.length,
        errors: errorAlerts,
        disputes: disputeAlerts,
        preorders: preorderAlerts,
        price_adjustments: priceAdjustmentAlerts
      },
      admin_notices: stats.admin_notices || []
    };
  });
  
  // Calculate total feature usage across all stores
  const featureUsage = {
    error_tracking: 0,
    dispute_protection: 0,
    preorder_system: 0,
    price_protection: 0,
    health_monitoring: 0,
    subscription_acknowledgment: 0
  };
  
  enhancedStores.forEach(store => {
    if (store.features.error_tracking) featureUsage.error_tracking++;
    if (store.features.dispute_protection) featureUsage.dispute_protection++;
    if (store.features.preorder_system) featureUsage.preorder_system++;
    if (store.features.price_protection) featureUsage.price_protection++;
    if (store.features.health_monitoring) featureUsage.health_monitoring++;
    if (store.features.subscription_acknowledgment) featureUsage.subscription_acknowledgment++;
  });
  
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "2.4.0",
    overview: {
      totalSites: sites.length,
      criticalAlerts: alertHistory.filter(a => a.severity === "critical").length,
      highAlerts: alertHistory.filter(a => a.severity === "high").length,
      mediumAlerts: alertHistory.filter(a => a.severity === "medium").length,
      totalAlerts: alertHistory.length,
      featureUsage: featureUsage
    },
    recentAlerts: alertHistory.slice(0, 20), // Show more alerts
    stores: enhancedStores
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
// 5. DEEPSEEK AI CHAT ENDPOINT
// ==========================================
app.post("/api/chat/deepseek", async (req, res) => {
  try {
    const { question, storeData, chatHistory } = req.body;
    
    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: "Question is required" });
    }
    
    // Check if we have a DeepSeek API key
    const deepseekApiKey = process.env.DEEPSEEK_API_KEY;
    const useMock = !deepseekApiKey || process.env.USE_MOCK_AI === 'true';
    
    let response;
    
    if (useMock) {
      // Mock AI response based on question and store data
      response = generateMockAIResponse(question, storeData, chatHistory);
    } else {
      // Real DeepSeek API call
      response = await callDeepSeekAPI(question, storeData, chatHistory, deepseekApiKey);
    }
    
    res.status(200).json({ response });
    
  } catch (error) {
    console.error('DeepSeek chat error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Mock AI response generator
function generateMockAIResponse(question, storeData, chatHistory) {
  const lowerQuestion = question.toLowerCase();
  
  // Analyze store data if available
  let storeAnalysis = '';
  if (storeData) {
    const { store, alerts, adminNotices, pluginVersion } = storeData;
    
    // Check for common issues
    const criticalAlerts = alerts.filter(a => a.severity === 'critical');
    const stripeNotices = adminNotices.filter(n => n.type && n.type.includes('stripe'));
    const hasActionSchedulerErrors = alerts.some(a => 
      a.message && a.message.includes('Action Scheduler') && a.message.includes('failed')
    );
    
    storeAnalysis = `\n\n**Store Analysis (${store.name}):**\n`;
    storeAnalysis += `- Plugin version: ${pluginVersion}\n`;
    
    if (criticalAlerts.length > 0) {
      storeAnalysis += `- ⚠️ ${criticalAlerts.length} critical alerts\n`;
    }
    
    if (stripeNotices.length > 0) {
      storeAnalysis += `- 💳 Stripe issues detected: ${stripeNotices.length} notice(s)\n`;
    }
    
    if (hasActionSchedulerErrors) {
      storeAnalysis += `- ⏰ Action Scheduler/WP-Cron may be broken\n`;
    }
    
    if (pluginVersion && pluginVersion.startsWith('4.4.')) {
      storeAnalysis += `- ✅ Plugin is up to date (v${pluginVersion})\n`;
    }
  }
  
  // Common question patterns
  if (lowerQuestion.includes('stripe') && lowerQuestion.includes('not active')) {
    return `**Stripe "Not Active" Warning Fix**${storeAnalysis}

This warning appears when:
1. **Stripe Gateway plugin is not installed** – Install "WooCommerce Stripe Payment Gateway" from WordPress.org
2. **Stripe gateway is disabled** – Go to WooCommerce → Settings → Payments → Stripe → Enable
3. **Plugin version mismatch** – Ensure Stripe plugin is v10.4.0+

**Steps to fix:**
1. Check if Stripe plugin is installed (Plugins → Installed Plugins)
2. If installed, enable it in WooCommerce Payments settings
3. If missing, install from WordPress plugin repository
4. After enabling, the warning should disappear within 1 hour

The monitoring dashboard logs these warnings in "Admin Notices" for tracking.`;
    
  } else if (lowerQuestion.includes('action scheduler') || lowerQuestion.includes('wp-cron')) {
    return `**Action Scheduler / WP-Cron Issues**${storeAnalysis}

Action Scheduler is WooCommerce's background task system. When it fails:
- Subscription renewals stop
- Scheduled updates don't run  
- Emails may not send

**Common causes & fixes:**

1. **WP-Cron disabled** – Check if \`DISABLE_WP_CRON\` is \`true\` in wp-config.php
   - Fix: Set to \`false\` or use real cron: \`*/5 * * * * wget -q -O /dev/null https://your-site.com/wp-cron.php\`

2. **Memory limits** – Increase PHP memory: \`define('WP_MEMORY_LIMIT', '256M');\`

3. **Too many pending tasks** – Clear old tasks:
   - Install "WP Crontrol" plugin
   - Check WooCommerce → Status → Scheduled Actions
   - Delete very old failed tasks

4. **Hosting restrictions** – Some hosts block wp-cron
   - Contact host to enable cron jobs

**Immediate check:** Go to WooCommerce → Status → Scheduled Actions. Look for "Failed" tasks > 50.`;
    
  } else if (lowerQuestion.includes('fatal error') || lowerQuestion.includes('activation error')) {
    return `**Plugin Activation Fatal Error**${storeAnalysis}

Common causes when activating WooCommerce Comprehensive Monitor:

1. **PHP version too low** – Requires PHP 7.4+, you have ${process.env.PHP_VERSION || 'unknown'}
   - Fix: Upgrade PHP via hosting control panel

2. **Missing WooCommerce** – Plugin requires WooCommerce 5.0+
   - Fix: Install/activate WooCommerce first

3. **Database table conflicts** – Previous plugin version left corrupted tables
   - Fix: Deactivate, delete plugin, reinstall fresh

4. **Store ID generation issue (v4.4.6)** – Recent fix for consistent store IDs
   - Fix: Manually set \`wcm_store_id\` in wp_options table to: \`store-\` + first 8 chars of MD5(site URL)

**Debug steps:**
1. Check WordPress debug log: \`wp-content/debug.log\`
2. Enable WP_DEBUG in wp-config.php
3. Try manual plugin file replacement
4. Contact support with the error message`;

  } else if (lowerQuestion.includes('subscription') && lowerQuestion.includes('not renewing')) {
    return `**Subscription Renewal Issues**${storeAnalysis}

WooCommerce Subscriptions may fail to renew due to:

1. **Payment method expired** – Customer's card declined or expired
2. **WP-Cron broken** – Action Scheduler not running renewal hooks
3. **Gateway restrictions** – Stripe may block recurring payments
4. **Plugin conflicts** – Other plugins interfering with subscriptions

**Checklist:**
1. Verify WP-Cron is working (see Action Scheduler advice)
2. Check Stripe logs in WooCommerce → Status → Logs
3. Test with a sandbox subscription
4. Ensure "WooCommerce Subscriptions" plugin is active and updated

**Monitor solution:** The plugin's health checks should detect subscription renewal failures and alert you.`;
    
  } else if (lowerQuestion.includes('health check') || lowerQuestion.includes('monitor')) {
    return `**Monitoring Dashboard Guide**${storeAnalysis}

The WooCommerce Comprehensive Monitor provides:

**1. Health Checks** (hourly)
   - WooCommerce API connectivity
   - Stripe gateway status
   - Action Scheduler health
   - Subscription renewal checks
   - Failed order detection

**2. Error Tracking**
   - Frontend JavaScript errors
   - Checkout AJAX failures
   - PHP errors (via plugin logging)

**3. Alert System**
   - Email alerts to configured address
   - Dashboard notifications
   - Critical issue highlighting

**4. Store Management**
   - Auto-discovery of plugin installations
   - Manual store addition with API keys
   - Store statistics and version tracking

**Common issues shown:**
- 🔴 Critical: API disconnected, Action Scheduler broken
- 🟡 Warning: Stripe disabled, failed orders detected
- 🟢 Healthy: All systems operational

Use the dashboard to monitor all your stores from one location!`;
    
  } else {
    // General response
    return `**WooCommerce AI Assistant**${storeAnalysis}

I understand you're asking: "${question}"

I'm an AI assistant integrated with your WooCommerce monitoring dashboard. I can help you:

**Common Issues I Can Diagnose:**
- Stripe payment gateway configuration problems
- WP-Cron / Action Scheduler failures  
- Plugin activation errors
- Subscription renewal issues
- WooCommerce API connectivity
- Health check interpretations

**To get better help:**
1. Select a store from the dropdown above
2. Enable "Include store data in analysis"
3. Ask specific questions about errors or warnings

**Example questions:**
- "Why does my store show Stripe as not active?"
- "How do I fix the Action Scheduler errors?"
- "What does the health check 'critical' mean?"
- "How do I enable subscription renewals?"

For complex issues, I recommend checking WordPress error logs or consulting with a WooCommerce developer.`;
  }
}

// Real DeepSeek API call (placeholder - needs implementation)
async function callDeepSeekAPI(question, storeData, chatHistory, apiKey) {
  // This would make actual API call to DeepSeek
  // For now, use mock response
  return generateMockAIResponse(question, storeData, chatHistory);
}

// ==========================================
// 6. DASHBOARD HTML
// ==========================================
// Redirect root to dashboard
app.get("/", (req, res) => res.redirect("/dashboard"));

app.get("/dashboard", (req, res) => {
  try {
    // Check authentication if required
    if (REQUIRE_AUTH) {
      const token = req.query.authToken;
      const authData = token ? authTokens[token] : null;
      
      // Check if token is valid and not expired
      if (!authData || authData.expires < Date.now()) {
        // Serve login page
        const loginPage = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WooMonitor Login</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f0f2f5; color: #333; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .login-container { background: #fff; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); width: 100%; max-width: 400px; }
    h1 { text-align: center; margin-bottom: 24px; color: #2c3e50; font-size: 24px; }
    .form-group { margin-bottom: 20px; }
    label { display: block; font-weight: 600; margin-bottom: 8px; color: #555; }
    input { width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 16px; }
    input:focus { outline: none; border-color: #3498db; box-shadow: 0 0 0 3px rgba(52,152,219,0.15); }
    button { width: 100%; padding: 14px; background: #3498db; color: #fff; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; transition: background 0.2s; }
    button:hover { background: #2980b9; }
    button:disabled { background: #95a5a6; cursor: not-allowed; }
    .message { margin-top: 16px; padding: 12px; border-radius: 8px; text-align: center; font-size: 14px; }
    .message.success { background: #d4edda; color: #155724; }
    .message.error { background: #f8d7da; color: #721c24; }
    .code-input { text-align: center; font-size: 20px; letter-spacing: 8px; }
    .steps { display: none; }
    .step { display: none; }
    .step.active { display: block; }
    .back-link { text-align: center; margin-top: 16px; }
    .back-link a { color: #3498db; text-decoration: none; }
    .back-link a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="login-container">
    <h1>🔐 WooMonitor Login</h1>
    
    <div id="stepEmail" class="step active">
      <div class="form-group">
        <label for="email">Email Address</label>
        <input type="email" id="email" placeholder="cameron@ashbi.ca" value="cameron@ashbi.ca">
      </div>
      <button id="sendCodeBtn">Send Login Code</button>
      <div class="back-link">
        <a href="/dashboard?authToken=skip" onclick="if(!confirm('Skip authentication? Dashboard will be publicly accessible.')) return false;">Skip authentication (not recommended)</a>
      </div>
    </div>
    
    <div id="stepCode" class="step">
      <div class="form-group">
        <label for="code">6‑Digit Code</label>
        <input type="text" id="code" class="code-input" placeholder="000000" maxlength="6" pattern="\\d{6}">
        <small>Check your email for the 6‑digit code. It expires in 10 minutes.</small>
      </div>
      <button id="verifyCodeBtn">Verify Code</button>
      <div class="back-link">
        <a href="#" id="backToEmail">← Use a different email</a>
      </div>
    </div>
    
    <div id="message" class="message"></div>
  </div>

  <script>
    const emailInput = document.getElementById('email');
    const codeInput = document.getElementById('code');
    const sendCodeBtn = document.getElementById('sendCodeBtn');
    const verifyCodeBtn = document.getElementById('verifyCodeBtn');
    const messageDiv = document.getElementById('message');
    const stepEmail = document.getElementById('stepEmail');
    const stepCode = document.getElementById('stepCode');
    const backToEmailLink = document.getElementById('backToEmail');
    
    let currentEmail = '';
    
    async function showMessage(text, type) {
      messageDiv.textContent = text;
      messageDiv.className = 'message ' + type;
      messageDiv.style.display = 'block';
    }
    
    async function requestCode() {
      const email = emailInput.value.trim();
      if (!email || !email.includes('@')) {
        showMessage('Please enter a valid email address', 'error');
        return;
      }
      
      sendCodeBtn.disabled = true;
      sendCodeBtn.textContent = 'Sending...';
      
      try {
        const response = await fetch('/api/auth/request-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        
        const data = await response.json();
        
        if (response.ok) {
          currentEmail = email;
          stepEmail.classList.remove('active');
          stepCode.classList.add('active');
          showMessage('Code sent to ' + email, 'success');
          codeInput.focus();
        } else {
          showMessage(data.error || 'Failed to send code', 'error');
        }
      } catch (error) {
        showMessage('Network error: ' + error.message, 'error');
      } finally {
        sendCodeBtn.disabled = false;
        sendCodeBtn.textContent = 'Send Login Code';
      }
    }
    
    async function verifyCode() {
      const code = codeInput.value.trim();
      if (code.length !== 6 || !/^\\d{6}$/.test(code)) {
        showMessage('Please enter a valid 6‑digit code', 'error');
        return;
      }
      
      verifyCodeBtn.disabled = true;
      verifyCodeBtn.textContent = 'Verifying...';
      
      try {
        const response = await fetch('/api/auth/verify-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: currentEmail, code })
        });
        
        const data = await response.json();
        
        if (response.ok) {
          // Redirect to dashboard with token
          const url = new URL(window.location.href);
          url.searchParams.set('authToken', data.token);
          window.location.href = url.toString();
        } else {
          showMessage(data.error || 'Invalid code', 'error');
        }
      } catch (error) {
        showMessage('Network error: ' + error.message, 'error');
      } finally {
        verifyCodeBtn.disabled = false;
        verifyCodeBtn.textContent = 'Verify Code';
      }
    }
    
    sendCodeBtn.addEventListener('click', requestCode);
    verifyCodeBtn.addEventListener('click', verifyCode);
    backToEmailLink.addEventListener('click', (e) => {
      e.preventDefault();
      stepCode.classList.remove('active');
      stepEmail.classList.add('active');
      showMessage('', '');
    });
    
    // Allow Enter key in inputs
    emailInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') requestCode();
    });
    
    codeInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') verifyCode();
    });
    
    // Auto-focus email input
    emailInput.focus();
  </script>
</body>
</html>`;
        return res.send(loginPage);
      }
      
      // Token is valid, serve dashboard with token embedded
      const dashboardPath = path.join(__dirname, 'dashboard-enhanced.html');
      if (fs.existsSync(dashboardPath)) {
        let html = fs.readFileSync(dashboardPath, 'utf8');
        // Inject token into JavaScript for API calls
        html = html.replace('</body>', 
          `<script>
            window.authToken = '${token}';
            localStorage.setItem('authToken', '${token}');
          </script></body>`);
        res.send(html);
      } else {
        res.send(`<!DOCTYPE html><html><head><title>WooMonitor Dashboard</title></head><body>
          <h1>WooMonitor Dashboard</h1><p>dashboard-enhanced.html not found. Place it in the project root.</p>
          <p><a href="/api/dashboard">View API JSON</a></p></body></html>`);
      }
    } else {
      // Auth not required, serve dashboard normally
      const dashboardPath = path.join(__dirname, 'dashboard-enhanced.html');
      if (fs.existsSync(dashboardPath)) {
        res.send(fs.readFileSync(dashboardPath, 'utf8'));
      } else {
        res.send(`<!DOCTYPE html><html><head><title>WooMonitor Dashboard</title></head><body>
          <h1>WooMonitor Dashboard</h1><p>dashboard-enhanced.html not found. Place it in the project root.</p>
          <p><a href="/api/dashboard">View API JSON</a></p></body></html>`);
      }
    }
  } catch (error) {
    console.error('Error serving dashboard:', error);
    res.status(500).send('Error loading dashboard');
  }
});

// ==========================================
// 6. PLUGIN DOWNLOAD ENDPOINT
// ==========================================
app.get("/download/plugin", (req, res) => {
  // Redirect to the latest GitHub release
  // This will always point to the most recent release
  res.redirect(302, "https://github.com/camster91/woo-comprehensive-monitor/releases/latest");
});

// ==========================================
// 7. AUTHENTICATION ENDPOINTS
// ==========================================

/**
 * Send authentication code via email
 */
async function sendAuthCode(email, code) {
  if (!process.env.MAILGUN_API_KEY || !process.env.MAILGUN_DOMAIN) {
    console.log(`[Auth] Mock sending code ${code} to ${email} (Mailgun not configured)`);
    return true;
  }
  
  try {
    const mailFrom = process.env.MAIL_FROM || `WooMonitor Auth <auth@${process.env.MAILGUN_DOMAIN}>`;
    
    await axios.post(
      `https://api.mailgun.net/v3/${process.env.MAILGUN_DOMAIN}/messages`,
      new URLSearchParams({
        from: mailFrom,
        to: email,
        subject: `Your WooMonitor Login Code: ${code}`,
        text: `Your WooMonitor login code is: ${code}\n\nThis code will expire in 10 minutes.\n\nIf you didn't request this code, you can safely ignore this email.`,
      }),
      { auth: { username: "api", password: process.env.MAILGUN_API_KEY } }
    );
    
    console.log(`[Auth] Sent code ${code} to ${email} via Mailgun`);
    return true;
  } catch (error) {
    console.error(`[Auth] Failed to send code to ${email}:`, error.message);
    return false;
  }
}

/**
 * Generate a secure random token
 */
function generateToken(email) {
  const payload = {
    email,
    issued: Date.now(),
    expires: Date.now() + (30 * 24 * 60 * 60 * 1000), // 30 days
  };
  
  const token = crypto.randomBytes(32).toString('hex');
  authTokens[token] = payload;
  
  // Clean up expired tokens periodically
  const now = Date.now();
  for (const [t, data] of Object.entries(authTokens)) {
    if (data.expires < now) {
      delete authTokens[t];
    }
  }
  
  return token;
}

// Request authentication code
app.post("/api/auth/request-code", async (req, res) => {
  const { email } = req.body;
  
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email required' });
  }
  
  // Check if email is allowed
  if (!ALLOWED_EMAILS.includes(email.toLowerCase())) {
    console.log(`[Auth] Rejected login attempt for ${email} - not in allowed list`);
    return res.status(403).json({ error: 'Email not authorized' });
  }
  
  // Generate 6-digit code
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expires = Date.now() + (10 * 60 * 1000); // 10 minutes
  
  // Store code
  authCodes[email.toLowerCase()] = { code, expires };
  
  // Send code via email
  const sent = await sendAuthCode(email, code);
  
  if (!sent) {
    return res.status(500).json({ error: 'Failed to send authentication code' });
  }
  
  res.json({ success: true, message: 'Authentication code sent' });
});

// Verify authentication code and issue token
app.post("/api/auth/verify-code", async (req, res) => {
  const { email, code } = req.body;
  
  if (!email || !code) {
    return res.status(400).json({ error: 'Email and code required' });
  }
  
  const emailLower = email.toLowerCase();
  const authData = authCodes[emailLower];
  
  // Check if code exists and is not expired
  if (!authData || authData.expires < Date.now()) {
    return res.status(401).json({ error: 'Invalid or expired code' });
  }
  
  // Verify code
  if (authData.code !== code) {
    return res.status(401).json({ error: 'Invalid code' });
  }
  
  // Code is valid, generate token
  const token = generateToken(emailLower);
  
  // Clean up used code
  delete authCodes[emailLower];
  
  res.json({ 
    success: true, 
    token,
    email: emailLower,
    expires: authTokens[token].expires,
  });
});

// Get current user info
app.get("/api/auth/me", (req, res) => {
  const token = req.headers['x-auth-token'] || req.query.authToken;
  
  if (!token || !authTokens[token]) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  const authData = authTokens[token];
  if (authData.expires < Date.now()) {
    delete authTokens[token];
    return res.status(401).json({ error: 'Token expired' });
  }
  
  res.json({ 
    email: authData.email,
    issued: authData.issued,
    expires: authData.expires,
  });
});

// Logout (invalidate token)
app.post("/api/auth/logout", (req, res) => {
  const token = req.headers['x-auth-token'] || req.query.authToken;
  
  if (token && authTokens[token]) {
    delete authTokens[token];
  }
  
  res.json({ success: true });
});

// ==========================================
// 8. DEEP HEALTH WOOCOMMERCE MONITOR
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
  console.log(`🚀 WooCommerce Monitor Server v2.5.0`);
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
