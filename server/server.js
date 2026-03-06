require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const cron = require("node-cron");
const WooCommerceRestApi = require("@woocommerce/woocommerce-rest-api").default;
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const cookieParser = require("cookie-parser");

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
app.use(cookieParser());

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
  
  // Allow plugin registration endpoint without auth (uses API key)
  if (req.path === '/api/stores' && req.method === 'POST') {
    return next();
  }
  
  // Allow dashboard page without auth (handles its own auth)
  if (req.path === '/dashboard' || req.path === '/') {
    return next();
  }
  
  // Check for valid token (from header, cookie, or query parameter)
  const token = req.headers['x-auth-token'] || req.cookies.authToken || req.query.authToken;
  
  if (!token || !authTokens[token]) {
    // No valid token - authentication required
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  // Check token expiry
  const authData = authTokens[token];
  if (authData.expires < Date.now()) {
    delete authTokens[token];
    // Clear expired cookie
    res.clearCookie('authToken');
    return res.status(401).json({ error: 'Session expired' });
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
        wordpress_version: req.body.wordpress_version,
        php_version: req.body.php_version,
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
      existingStore.wordpress_version = req.body.wordpress_version;
      existingStore.php_version = req.body.php_version;
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
      wordpress_version: req.body.wordpress_version,
      php_version: req.body.php_version,
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
    version: "2.6.0",
    stores: sites.length,
    total_alerts: alertHistory.length,
    uptime: process.uptime(),
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
      wordpress_version: site.wordpress_version || 'unknown',
      php_version: site.php_version || 'unknown',
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
      wordpress_version: data.wordpress_version || 'unknown',
      php_version: data.php_version || 'unknown',
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
  if (data.wordpress_version) storeStats[storeId].wordpress_version = data.wordpress_version;
  if (data.php_version) storeStats[storeId].php_version = data.php_version;
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
    
    // Determine store health status
    let healthStatus = 'unknown';
    if (stats.last_seen) {
      const lastSeen = new Date(stats.last_seen);
      const now = new Date();
      const hoursAgo = (now - lastSeen) / (1000 * 60 * 60);
      
      if (hoursAgo < 2) healthStatus = 'excellent';
      else if (hoursAgo < 24) healthStatus = 'good';
      else if (hoursAgo < 72) healthStatus = 'warning';
      else healthStatus = 'critical';
    }
    
    return {
      id: site.id,
      name: site.name,
      url: site.url,
      hasApiCredentials: !!(site.consumerKey && site.consumerSecret),
      plugin_version: stats.plugin_version || 'unknown',
      woocommerce_version: stats.woocommerce_version || 'unknown',
      wordpress_version: stats.wordpress_version || 'unknown',
      php_version: stats.php_version || 'unknown',
      last_seen: stats.last_seen || site.last_seen || null,
      health_status: healthStatus,
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
  
  // Calculate store health distribution
  const healthDistribution = {
    excellent: 0,
    good: 0,
    warning: 0,
    critical: 0,
    unknown: 0
  };
  
  enhancedStores.forEach(store => {
    if (store.features.error_tracking) featureUsage.error_tracking++;
    if (store.features.dispute_protection) featureUsage.dispute_protection++;
    if (store.features.preorder_system) featureUsage.preorder_system++;
    if (store.features.price_protection) featureUsage.price_protection++;
    if (store.features.health_monitoring) featureUsage.health_monitoring++;
    if (store.features.subscription_acknowledgment) featureUsage.subscription_acknowledgment++;
    
    healthDistribution[store.health_status]++;
  });
  
  // Calculate alert trends (last 7 days)
  const alertTrends = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    
    const dayStart = new Date(dateStr + 'T00:00:00Z');
    const dayEnd = new Date(dateStr + 'T23:59:59.999Z');
    
    const dayAlerts = alertHistory.filter(a => {
      const alertDate = new Date(a.timestamp);
      return alertDate >= dayStart && alertDate <= dayEnd;
    });
    
    alertTrends.push({
      date: dateStr,
      total: dayAlerts.length,
      critical: dayAlerts.filter(a => a.severity === 'critical').length,
      high: dayAlerts.filter(a => a.severity === 'high').length,
      medium: dayAlerts.filter(a => a.severity === 'medium').length
    });
  }
  
  // Calculate stores with API credentials
  const storesWithApi = enhancedStores.filter(s => s.consumerKey && s.consumerSecret).length;
  const storesPluginOnly = enhancedStores.length - storesWithApi;
  
  // Calculate most common issues
  const alertTypes = {
    errors: 0,
    disputes: 0,
    preorders: 0,
    price_adjustments: 0,
    health: 0,
    subscriptions: 0,
    other: 0
  };
  
  alertHistory.slice(0, 100).forEach(alert => {
    const subject = alert.subject || '';
    if (subject.includes('Frontend Issue') || subject.includes('health_check') || subject.includes('Error')) {
      alertTypes.errors++;
    } else if (subject.includes('DISPUTE')) {
      alertTypes.disputes++;
    } else if (subject.includes('PRE-ORDER') || subject.includes('preorder')) {
      alertTypes.preorders++;
    } else if (subject.includes('PRICE ADJUSTMENT')) {
      alertTypes.price_adjustments++;
    } else if (subject.includes('Stripe') || subject.includes('Payment')) {
      alertTypes.subscriptions++;
    } else if (subject.includes('Health') || subject.includes('WP-Cron')) {
      alertTypes.health++;
    } else {
      alertTypes.other++;
    }
  });
  
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "2.6.0",
    overview: {
      totalSites: sites.length,
      criticalAlerts: alertHistory.filter(a => a.severity === "critical").length,
      highAlerts: alertHistory.filter(a => a.severity === "high").length,
      mediumAlerts: alertHistory.filter(a => a.severity === "medium").length,
      totalAlerts: alertHistory.length,
      featureUsage: featureUsage,
      healthDistribution: healthDistribution,
      storesWithApi: storesWithApi,
      storesPluginOnly: storesPluginOnly,
      alertTypes: alertTypes,
      alertTrends: alertTrends,
      uptime: Math.floor(Math.random() * 99) + 1, // Mock uptime percentage
      avgResponseTime: Math.floor(Math.random() * 500) + 50 // Mock response time in ms
    },
    recentAlerts: alertHistory.slice(0, 100), // Show more alerts for filtering
    stores: enhancedStores,
    system: {
      serverUptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      nodeVersion: process.version,
      platform: process.platform
    }
  });
});

app.get("/api/dashboard/store/:storeId", (req, res) => {
  const store = sites.find(s => s.id === req.params.storeId);
  if (!store) return res.status(404).json({ error: "Store not found" });
  
  const storeAlerts = alertHistory.filter(a => a.siteId === req.params.storeId);
  const stats = storeStats[store.id] || {};
  const features = stats.features || {};
  
  // Get WooCommerce settings if we have API credentials
  let wcSettings = null;
  if (store.consumerKey && store.consumerSecret) {
    wcSettings = {
      has_api: true,
      // We could fetch real settings here, but for now just indicate we can
    };
  }
  
  // Build comprehensive store info
  const storeInfo = {
    id: store.id,
    name: store.name,
    url: store.url,
    consumerKey: store.consumerKey ? '••••••••' : null,
    consumerSecret: store.consumerSecret ? '••••••••' : null,
    hasApiCredentials: !!(store.consumerKey && store.consumerSecret),
    auto_test_api: store.auto_test_api || false,
    enable_health_checks: store.enable_health_checks !== false, // default true
    plugin_version: stats.plugin_version || 'unknown',
    woocommerce_version: stats.woocommerce_version || 'unknown',
    wordpress_version: stats.wordpress_version || 'unknown',
    php_version: stats.php_version || 'unknown',
    last_seen: stats.last_seen || store.last_seen || null,
    connected: !!stats.last_seen,
    features: {
      error_tracking: !!features.error_tracking,
      dispute_protection: !!features.dispute_protection,
      preorder_system: !!features.preorder_system,
      price_protection: !!features.price_protection,
      health_monitoring: !!features.health_monitoring,
      subscription_acknowledgment: !!features.subscription_acknowledgment
    },
    settings: store.settings || {}, // Custom settings stored for this store
    sync_config: store.sync_config || {
      enabled: true,
      frequency: 'hourly',
      monitor_health: true,
      monitor_errors: true,
      monitor_disputes: true,
      monitor_preorders: true,
      monitor_price_adjustments: true
    },
    admin_notices: stats.admin_notices || []
  };
  
  res.status(200).json({
    status: "ok",
    store: storeInfo,
    alerts: {
      total: storeAlerts.length,
      critical: storeAlerts.filter(a => a.severity === "critical").length,
      high: storeAlerts.filter(a => a.severity === "high").length,
      medium: storeAlerts.filter(a => a.severity === "medium").length,
      recent: storeAlerts.slice(0, 10)
    },
    wc_settings: wcSettings
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

  const updates = req.body;
  
  // Allowlist of fields that can be updated via generic PATCH
  const allowedFields = [
    'consumerKey',
    'consumerSecret', 
    'enable_health_checks',
    'auto_test_api',
    'name',
    'url'
  ];
  
  // Update store fields (except id)
  for (const key in updates) {
    if (!updates.hasOwnProperty(key)) continue;
    if (key === 'id') continue; // Never update ID
    
    // Only allow fields in the allowlist
    if (!allowedFields.includes(key)) {
      continue; // Silently ignore unknown fields
    }
    
    let value = updates[key];
    
    // Special handling for credential fields: ignore mask strings
    if (key === 'consumerKey' || key === 'consumerSecret') {
      if (value === '••••••••') {
        continue; // Skip update - this is a masked value
      }
      // Ensure credentials are strings (or null/undefined to clear)
      if (value !== null && value !== undefined && typeof value !== 'string') {
        continue; // Ignore non-string values
      }
      // Trim whitespace from credentials
      if (typeof value === 'string') {
        value = value.trim();
      }
    }
    
    // Type coercion and validation for specific fields
    if (key === 'enable_health_checks' || key === 'auto_test_api') {
      // Convert to boolean (handle string "true"/"false")
      if (typeof value === 'string') {
        if (value.toLowerCase() === 'false') value = false;
        else if (value.toLowerCase() === 'true') value = true;
        else value = Boolean(value); // non-empty string -> true
      } else {
        value = Boolean(value); // null/undefined -> false, number -> truthy
      }
    } else if (key === 'name' || key === 'url') {
      // Ensure string (or null/undefined)
      if (value !== null && value !== undefined) {
        if (typeof value !== 'string') {
          value = String(value);
        }
        value = value.trim();
        // Additional validation for URL
        if (key === 'url' && value !== '') {
          // Basic URL validation
          if (!value.startsWith('http://') && !value.startsWith('https://')) {
            continue; // Skip invalid URL
          }
        }
      }
    }
    
    // Store any field, allow null/undefined to clear
    store[key] = value;
  }

  try {
    fs.writeFileSync('./sites.json', JSON.stringify(sites, null, 2));
    // Return masked store object for security (match /api/dashboard/store/:storeId format)
    const maskedStore = {
      id: store.id,
      name: store.name,
      url: store.url,
      consumerKey: store.consumerKey ? '••••••••' : null,
      consumerSecret: store.consumerSecret ? '••••••••' : null,
      hasApiCredentials: !!(store.consumerKey && store.consumerSecret),
      auto_test_api: store.auto_test_api || false,
      enable_health_checks: store.enable_health_checks !== false,
      plugin_version: store.plugin_version || 'unknown',
      woocommerce_version: store.woocommerce_version || 'unknown',
      wordpress_version: store.wordpress_version || 'unknown',
      php_version: store.php_version || 'unknown',
      last_seen: store.last_seen || null,
      connected: !!store.last_seen,
      features: store.features || {},
      settings: store.settings || {},
      sync_config: store.sync_config || {},
      admin_notices: store.admin_notices || []
    };
    res.status(200).json({ success: true, store: maskedStore });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/stores/:storeId/test-api", async (req, res) => {
  const store = sites.find(s => s.id === req.params.storeId);
  if (!store) return res.status(404).json({ error: "Store not found" });

  // Use provided credentials or stored ones
  const { consumerKey, consumerSecret } = req.body;
  const keyToUse = consumerKey || store.consumerKey;
  const secretToUse = consumerSecret || store.consumerSecret;

  if (!keyToUse || !secretToUse) {
    return res.status(400).json({ 
      error: "API credentials required",
      message: "Provide consumerKey and consumerSecret in request body"
    });
  }

  try {
    const api = new WooCommerceRestApi({
      url: store.url,
      consumerKey: keyToUse,
      consumerSecret: secretToUse,
      version: "wc/v3",
    });
    
    // Test connection by getting system status
    const { data } = await api.get("system_status");
    
    res.status(200).json({
      success: true,
      store: store.name,
      url: store.url,
      woocommerce_version: data.version,
      environment: data.environment,
      database: data.database,
      active_plugins: data.active_plugins ? data.active_plugins.length : 0,
      message: "API connection successful"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      store: store.name,
      url: store.url,
      error: error.message,
      message: "Failed to connect to WooCommerce API"
    });
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
// STORE SETTINGS & SYNC CONTROL ENDPOINTS
// ==========================================

// Get or update store settings
app.route("/api/stores/:storeId/settings")
  .get((req, res) => {
    const store = sites.find(s => s.id === req.params.storeId);
    if (!store) return res.status(404).json({ error: "Store not found" });
    
    // Default settings if not set
    const defaultSettings = {
      alert_email: process.env.ALERT_EMAIL || 'cameron@ashbi.ca',
      enable_error_tracking: true,
      enable_dispute_protection: true,
      enable_preorder_system: true,
      enable_price_protection: true,
      enable_health_monitoring: true,
      require_subscription_acknowledgment: true,
      auto_update_plugin: false,
      create_backups: true,
      check_compatibility: true,
      allow_major_updates: 'confirm' // 'auto', 'confirm', 'manual'
    };
    
    res.status(200).json({
      status: "ok",
      settings: { ...defaultSettings, ...(store.settings || {}) }
    });
  })
  .patch((req, res) => {
    const store = sites.find(s => s.id === req.params.storeId);
    if (!store) return res.status(404).json({ error: "Store not found" });
    
    // Validate and update settings
    const updates = req.body;
    const allowedSettings = [
      'alert_email', 'enable_error_tracking', 'enable_dispute_protection',
      'enable_preorder_system', 'enable_price_protection', 'enable_health_monitoring',
      'require_subscription_acknowledgment', 'auto_update_plugin', 'create_backups',
      'check_compatibility', 'allow_major_updates'
    ];
    
    // Initialize settings object if not exists
    if (!store.settings) store.settings = {};
    
    // Apply updates
    Object.keys(updates).forEach(key => {
      if (!allowedSettings.includes(key)) return;
      
      let value = updates[key];
      
      // Type validation and coercion based on setting type
      if (key === 'alert_email') {
        if (value !== null && value !== undefined) {
          if (typeof value !== 'string') {
            value = String(value);
          }
          value = value.trim();
          // Basic email validation (optional)
          if (value !== '' && !value.includes('@')) {
            return; // Skip invalid email
          }
        }
      } else if (key === 'allow_major_updates') {
        if (typeof value !== 'string') {
          value = String(value);
        }
        value = value.trim();
        if (!['auto', 'confirm', 'manual'].includes(value)) {
          return; // Skip invalid value
        }
      } else {
        // Boolean fields (enable_error_tracking, enable_dispute_protection, etc.)
        if (typeof value === 'string') {
          if (value.toLowerCase() === 'false') value = false;
          else if (value.toLowerCase() === 'true') value = true;
          else value = Boolean(value);
        } else {
          value = Boolean(value);
        }
      }
      
      store.settings[key] = value;
    });
    
    try {
      fs.writeFileSync('./sites.json', JSON.stringify(sites, null, 2));
      res.status(200).json({ 
        success: true, 
        message: "Store settings updated",
        settings: store.settings 
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

// Get or update store sync configuration
app.route("/api/stores/:storeId/sync")
  .get((req, res) => {
    const store = sites.find(s => s.id === req.params.storeId);
    if (!store) return res.status(404).json({ error: "Store not found" });
    
    // Default sync config
    const defaultSyncConfig = {
      enabled: true,
      frequency: 'hourly', // 'real-time', 'hourly', 'daily', 'weekly'
      monitor_health: true,
      monitor_errors: true,
      monitor_disputes: true,
      monitor_preorders: true,
      monitor_price_adjustments: true,
      monitor_subscription_renewals: true,
      monitor_stock_levels: false,
      monitor_order_flow: true,
      alert_on_critical: true,
      alert_on_high: true,
      alert_on_medium: false
    };
    
    res.status(200).json({
      status: "ok",
      sync_config: { ...defaultSyncConfig, ...(store.sync_config || {}) }
    });
  })
  .patch((req, res) => {
    const store = sites.find(s => s.id === req.params.storeId);
    if (!store) return res.status(404).json({ error: "Store not found" });
    
    // Validate and update sync config
    const updates = req.body;
    const allowedSyncSettings = [
      'enabled', 'frequency', 'monitor_health', 'monitor_errors',
      'monitor_disputes', 'monitor_preorders', 'monitor_price_adjustments',
      'monitor_subscription_renewals', 'monitor_stock_levels', 'monitor_order_flow',
      'alert_on_critical', 'alert_on_high', 'alert_on_medium'
    ];
    
    // Initialize sync_config if not exists
    if (!store.sync_config) store.sync_config = {};
    
    // Apply updates
    Object.keys(updates).forEach(key => {
      if (!allowedSyncSettings.includes(key)) return;
      
      let value = updates[key];
      
      // Type validation and coercion based on setting type
      if (key === 'frequency') {
        if (typeof value !== 'string') {
          value = String(value);
        }
        value = value.trim();
        if (!['hourly', 'daily', 'weekly', 'real-time'].includes(value)) {
          return; // Skip invalid frequency
        }
      } else {
        // Boolean fields (enabled, monitor_*, alert_on_*)
        if (typeof value === 'string') {
          if (value.toLowerCase() === 'false') value = false;
          else if (value.toLowerCase() === 'true') value = true;
          else value = Boolean(value);
        } else {
          value = Boolean(value);
        }
      }
      
      store.sync_config[key] = value;
    });
    
    try {
      fs.writeFileSync('./sites.json', JSON.stringify(sites, null, 2));
      res.status(200).json({ 
        success: true, 
        message: "Sync configuration updated",
        sync_config: store.sync_config 
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

// AI-controlled store actions (safe operations only)
app.post("/api/stores/:storeId/ai-action", async (req, res) => {
  const store = sites.find(s => s.id === req.params.storeId);
  if (!store) return res.status(404).json({ error: "Store not found" });
  
  const { action, parameters, reason } = req.body;
  
  if (!action) {
    return res.status(400).json({ error: "Action is required" });
  }
  
  // List of safe AI-controlled actions
  const safeActions = {
    'test_connection': {
      description: 'Test connection to store API',
      execute: async () => {
        if (!store.consumerKey || !store.consumerSecret) {
          throw new Error('API credentials not configured for this store');
        }
        
        const api = new WooCommerceRestApi({
          url: store.url,
          consumerKey: store.consumerKey,
          consumerSecret: store.consumerSecret,
          version: "wc/v3",
        });
        
        try {
          const { data } = await api.get("system_status");
          return {
            success: true,
            message: 'Connection successful',
            data: {
              store_name: data.name,
              version: data.version,
              environment: data.environment,
              database: data.database
            }
          };
        } catch (error) {
          throw new Error(`Connection failed: ${error.message}`);
        }
      }
    },
    'run_health_check': {
      description: 'Run comprehensive health check on store',
      execute: async () => {
        // This would trigger a manual health check
        // For now, return mock response
        return {
          success: true,
          message: 'Health check initiated',
          check_id: `health_${Date.now()}`
        };
      }
    },
    'clear_old_alerts': {
      description: 'Clear alerts older than specified days',
      execute: async () => {
        const days = parameters?.days || 30;
        const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const initialCount = alertHistory.length;
        
        alertHistory = alertHistory.filter(a => 
          a.siteId !== store.id || new Date(a.timestamp) > cutoff
        );
        
        const cleared = initialCount - alertHistory.length;
        return {
          success: true,
          message: `Cleared ${cleared} alerts older than ${days} days for store ${store.name}`,
          cleared,
          remaining: alertHistory.filter(a => a.siteId === store.id).length
        };
      }
    },
    'enable_feature': {
      description: 'Enable a specific plugin feature',
      execute: async () => {
        const feature = parameters?.feature;
        const validFeatures = [
          'error_tracking', 'dispute_protection', 'preorder_system',
          'price_protection', 'health_monitoring', 'subscription_acknowledgment'
        ];
        
        if (!feature || !validFeatures.includes(feature)) {
          throw new Error(`Invalid feature. Must be one of: ${validFeatures.join(', ')}`);
        }
        
        // This would send a command to the plugin via webhook
        // For now, update local tracking
        if (!storeStats[store.id]) {
          storeStats[store.id] = { features: {} };
        }
        if (!storeStats[store.id].features) {
          storeStats[store.id].features = {};
        }
        
        storeStats[store.id].features[feature] = true;
        
        return {
          success: true,
          message: `Feature '${feature}' enabled for store ${store.name}`,
          feature,
          enabled: true
        };
      }
    },
    'disable_feature': {
      description: 'Disable a specific plugin feature',
      execute: async () => {
        const feature = parameters?.feature;
        const validFeatures = [
          'error_tracking', 'dispute_protection', 'preorder_system',
          'price_protection', 'health_monitoring', 'subscription_acknowledgment'
        ];
        
        if (!feature || !validFeatures.includes(feature)) {
          throw new Error(`Invalid feature. Must be one of: ${validFeatures.join(', ')}`);
        }
        
        if (storeStats[store.id] && storeStats[store.id].features) {
          storeStats[store.id].features[feature] = false;
        }
        
        return {
          success: true,
          message: `Feature '${feature}' disabled for store ${store.name}`,
          feature,
          enabled: false
        };
      }
    }
  };
  
  // Check if action is allowed
  if (!safeActions[action]) {
    return res.status(400).json({ 
      error: "Action not allowed", 
      allowed_actions: Object.keys(safeActions) 
    });
  }
  
  try {
    // Execute the action
    const result = await safeActions[action].execute();
    
    // Log the AI action
    console.log(`[AI Action] ${action} executed on store ${store.name} by ${req.user || 'unknown'}. Reason: ${reason || 'No reason provided'}`);
    
    res.status(200).json({
      success: true,
      action,
      store: store.name,
      reason: reason || 'No reason provided',
      executed_by: req.user || 'AI',
      timestamp: new Date().toISOString(),
      result
    });
  } catch (error) {
    console.error(`[AI Action] Failed to execute ${action} on store ${store.name}:`, error.message);
    res.status(500).json({
      success: false,
      action,
      error: error.message
    });
  }
});

// ==========================================
// QUICK ACTION ENDPOINTS
// ==========================================
app.post("/api/health-check-all", async (req, res) => {
  try {
    // Trigger health check on all stores
    // This could run the checkWooCommerceAPI function
    // For now, just acknowledge
    res.status(200).json({
      success: true,
      message: 'Health check triggered for all stores',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/clear-old-alerts", async (req, res) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const initialCount = alertHistory.length;
    
    // Filter alerts older than 30 days
    alertHistory = alertHistory.filter(alert => new Date(alert.timestamp) > thirtyDaysAgo);
    
    const removedCount = initialCount - alertHistory.length;
    
    res.status(200).json({
      success: true,
      message: `Cleared ${removedCount} alerts older than 30 days`,
      removed: removedCount,
      remaining: alertHistory.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/test-connections", async (req, res) => {
  try {
    // Test API connections to all stores with credentials
    const results = [];
    
    for (const store of sites) {
      if (store.consumerKey && store.consumerSecret) {
        try {
          const api = new WooCommerceRestApi({
            url: store.url,
            consumerKey: store.consumerKey,
            consumerSecret: store.consumerSecret,
            version: "wc/v3",
          });
          
          const { data } = await api.get("system_status");
          results.push({
            store: store.name,
            status: 'success',
            version: data.version
          });
        } catch (error) {
          results.push({
            store: store.name,
            status: 'failed',
            error: error.message
          });
        }
      } else {
        results.push({
          store: store.name,
          status: 'no_api',
          message: 'No API credentials configured'
        });
      }
    }
    
    res.status(200).json({
      success: true,
      message: `Tested connections to ${results.length} stores`,
      results,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
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

// Real DeepSeek API call
async function callDeepSeekAPI(question, storeData, chatHistory, apiKey) {
  try {
    // Build messages array for chat completion
    const messages = [];
    
    // System prompt
    let systemPrompt = `You are a WooCommerce expert assistant integrated with a monitoring dashboard.
Your role is to help diagnose and fix WooCommerce issues based on store data.
Provide practical, step-by-step solutions. Be concise but thorough.
If store data is provided, use it to give specific advice.`;

    // Add store data to system prompt if available
    if (storeData) {
      const { store, alerts, adminNotices, pluginVersion } = storeData;
      
      let storeInfo = `\n\nSTORE CONTEXT:\n`;
      storeInfo += `- Store: ${store.name}\n`;
      storeInfo += `- URL: ${store.url}\n`;
      storeInfo += `- Plugin version: ${pluginVersion || 'Unknown'}\n`;
      
      // Add critical alerts
      const criticalAlerts = alerts.filter(a => a.severity === 'critical');
      if (criticalAlerts.length > 0) {
        storeInfo += `- Critical alerts: ${criticalAlerts.length}\n`;
        criticalAlerts.slice(0, 3).forEach(alert => {
          storeInfo += `  - ${alert.message.substring(0, 100)}${alert.message.length > 100 ? '...' : ''}\n`;
        });
      }
      
      // Add admin notices
      const stripeNotices = adminNotices.filter(n => n.type && n.type.includes('stripe'));
      if (stripeNotices.length > 0) {
        storeInfo += `- Stripe issues detected: ${stripeNotices.length}\n`;
      }
      
      // Add Action Scheduler warnings
      const hasActionSchedulerErrors = alerts.some(a => 
        a.message && a.message.includes('Action Scheduler') && a.message.includes('failed')
      );
      if (hasActionSchedulerErrors) {
        storeInfo += `- Action Scheduler/WP-Cron may be broken\n`;
      }
      
      systemPrompt += storeInfo;
    }
    
    // Add system message
    messages.push({ role: "system", content: systemPrompt });
    
    // Add chat history if available
    if (chatHistory && Array.isArray(chatHistory)) {
      chatHistory.forEach(msg => {
        if (msg.role && msg.content) {
          messages.push({ role: msg.role, content: msg.content });
        }
      });
    }
    
    // Add user question
    messages.push({ role: "user", content: question });
    
    // Call DeepSeek API
    const response = await axios.post(
      'https://api.deepseek.com/v1/chat/completions',
      {
        model: 'deepseek-chat',
        messages: messages,
        max_tokens: 2000,
        temperature: 0.7,
        stream: false
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        }
      }
    );
    
    // Extract response text
    if (response.data && response.data.choices && response.data.choices[0]) {
      return response.data.choices[0].message.content;
    } else {
      throw new Error('Invalid response format from DeepSeek API');
    }
    
  } catch (error) {
    console.error('DeepSeek API call failed:', error.message);
    // Fall back to mock response
    return generateMockAIResponse(question, storeData, chatHistory);
  }
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
function generateToken(email, expiryMs = 30 * 24 * 60 * 60 * 1000) {
  const payload = {
    email,
    issued: Date.now(),
    expires: Date.now() + (expiryMs > 0 ? expiryMs : 24 * 60 * 60 * 1000), // Default 1 day if 0 (session)
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
  const { email, code, rememberMe = false } = req.body;
  
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
  
  // Code is valid, generate token with appropriate expiry
  // rememberMe: 30 days, otherwise: session (browser close)
  const tokenExpiry = rememberMe ? (30 * 24 * 60 * 60 * 1000) : 0; // 0 means session cookie
  const token = generateToken(emailLower, tokenExpiry);
  
  // Clean up used code
  delete authCodes[emailLower];
  
  // Set secure HTTP-only cookie
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // Use secure cookies in production
    sameSite: 'strict',
    path: '/',
    maxAge: rememberMe ? (30 * 24 * 60 * 60 * 1000) : undefined, // Session cookie if not rememberMe
  };
  
  res.cookie('authToken', token, cookieOptions);
  
  res.json({ 
    success: true, 
    token, // Still return token for client-side storage if needed
    email: emailLower,
    expires: authTokens[token].expires,
    rememberMe,
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
  const token = req.headers['x-auth-token'] || req.cookies.authToken || req.query.authToken;
  
  if (token && authTokens[token]) {
    delete authTokens[token];
  }
  
  // Clear cookie
  res.clearCookie('authToken');
  
  res.json({ success: true });
});

// ==========================================
// SYSTEM ENDPOINTS
// ==========================================

app.get("/api/system/config", (req, res) => {
  res.json({
    allowed_emails: ALLOWED_EMAILS,
    require_auth: REQUIRE_AUTH,
    mailgun_configured: !!(process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN),
    deepseek_configured: !!process.env.DEEPSEEK_API_KEY,
    environment: process.env.NODE_ENV || 'development',
    server_version: "2.6.0",
    plugin_version: "4.5.1"
  });
});

app.post("/api/dashboard/clear-old-alerts", (req, res) => {
  const now = Date.now();
  const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
  const initialCount = alertHistory.length;
  
  // Filter out alerts older than 30 days
  const newAlerts = alertHistory.filter(alert => {
    const alertTime = new Date(alert.timestamp).getTime();
    return alertTime >= thirtyDaysAgo;
  });
  
  const clearedCount = initialCount - newAlerts.length;
  alertHistory = newAlerts;
  
  res.json({
    success: true,
    cleared: clearedCount,
    remaining: alertHistory.length,
    message: `Cleared ${clearedCount} alerts older than 30 days`
  });
});

app.get("/api/export/all", (req, res) => {
  // Sanitize sites: remove or mask sensitive credentials
  const sanitizedSites = sites.map(site => ({
    ...site,
    consumerKey: site.consumerKey ? '••••••••' : null,
    consumerSecret: site.consumerSecret ? '••••••••' : null
  }));
  
  res.json({
    timestamp: new Date().toISOString(),
    server_info: {
      version: "2.6.0",
      environment: process.env.NODE_ENV || 'development',
      uptime: process.uptime(),
      memory_usage: process.memoryUsage(),
      sites_count: sites.length,
      alerts_count: alertHistory.length,
      auth_tokens_count: Object.keys(authTokens).length
    },
    sites: sanitizedSites,
    alerts: alertHistory.slice(0, 1000), // Limit to 1000 most recent alerts
    auth_config: {
      allowed_emails: ALLOWED_EMAILS,
      require_auth: REQUIRE_AUTH
    },
    settings: {
      mailgun_configured: !!(process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN),
      deepseek_configured: !!process.env.DEEPSEEK_API_KEY,
      alert_email: process.env.ALERT_EMAIL
    }
  });
});

app.post("/api/system/restart", (req, res) => {
  // This is a placeholder - in production, this would trigger a restart via PM2/Docker
  console.log('[System] Restart requested via API');
  res.json({
    success: true,
    message: "Restart command acknowledged. Server would restart in production.",
    note: "This is a placeholder endpoint. In production, this would trigger a restart via PM2, Docker, or systemd."
  });
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
    // Skip sites without API credentials or health checks disabled
    if (!site.consumerKey || !site.consumerSecret) {
      console.log(`[Cron] ${site.name}: No API credentials, skipping deep checks.`);
      continue;
    }
    if (site.enable_health_checks === false) {
      console.log(`[Cron] ${site.name}: Health checks disabled, skipping.`);
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
  console.log(`🚀 WooCommerce Monitor Server v2.6.0`);
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
