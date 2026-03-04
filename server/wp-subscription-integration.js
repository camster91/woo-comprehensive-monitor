/**
 * WP Subscription Integration Module for Woo Monitor
 * 
 * This module adds WP Subscription-specific monitoring to the Woo Monitor system.
 * It tracks subscription lifecycle events, failed renewals, churn metrics, and more.
 * 
 * Requirements:
 * - WP Subscription Pro with REST API enabled
 * - API key from WP Subscription settings
 * - Added to sites.json configuration
 */

const axios = require('axios');

/**
 * WP Subscription Monitor Class
 */
class WPSubscriptionMonitor {
  constructor(siteConfig) {
    this.site = siteConfig;
    this.apiUrl = `${siteConfig.url}/wp-json/wpsubscription/v1/action`;
    this.apiKey = siteConfig.wpsApiKey;
    this.enabled = siteConfig.wpsEnabled || false;
  }

  /**
   * Check if WP Subscription monitoring is enabled and configured
   */
  isConfigured() {
    return this.enabled && this.apiKey && this.apiKey !== 'your_wps_api_key_here';
  }

  /**
   * Verify API connection to WP Subscription
   */
  async verifyConnection() {
    if (!this.isConfigured()) {
      return { success: false, error: 'WP Subscription not configured' };
    }

    try {
      const response = await axios.post(this.apiUrl, {
        action: 'verify_api',
        api_key: this.apiKey
      }, {
        timeout: 10000 // 10 second timeout
      });

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        status: error.response?.status
      };
    }
  }

  /**
   * Get subscription statistics
   * Note: This would require custom endpoint in WP Subscription
   * For now, we'll monitor through WooCommerce API and logs
   */
  async getSubscriptionStats() {
    if (!this.isConfigured()) {
      return null;
    }

    // In a future version, WP Subscription might add stats endpoints
    // For now, we'll track through other methods
    return {
      message: 'Subscription stats monitoring requires WP Subscription API enhancements',
      suggestion: 'Monitor through WooCommerce orders and failed renewals for now'
    };
  }

  /**
   * Check for subscription-specific issues
   */
  async checkSubscriptionHealth(sendAlert) {
    if (!this.isConfigured()) {
      return;
    }

    console.log(`[WP Subscription] Checking health for ${this.site.name}`);

    try {
      // 1. Verify API connection
      const connection = await this.verifyConnection();
      if (!connection.success) {
        await sendAlert(
          `WP Subscription API Disconnected on ${this.site.name}`,
          `Cannot connect to WP Subscription API. Error: ${connection.error}\n\n` +
          `Check that:\n` +
          `1. WP Subscription Pro is installed and active\n` +
          `2. REST API is enabled in WP Subscription settings\n` +
          `3. API key is correct in sites.json\n` +
          `4. The site is accessible`
        );
        return;
      }

      // 2. Check subscription renewal failures (via WooCommerce API)
      // This is already done in the main server.js, but we can add more context
      console.log(`[WP Subscription] API connection verified for ${this.site.name}`);

    } catch (error) {
      console.error(`[WP Subscription Error] ${this.site.name}:`, error.message);
    }
  }

  /**
   * Monitor subscription lifecycle events
   * This would ideally hook into WP Subscription webhooks or database
   */
  async monitorLifecycleEvents(sendAlert) {
    if (!this.isConfigured()) {
      return;
    }

    // This is a placeholder for future webhook integration
    // WP Subscription would need to send webhooks for events like:
    // - subscription_created
    // - subscription_renewed
    // - subscription_cancelled
    // - subscription_paused
    // - subscription_resumed
    // - payment_failed
    // - subscription_expired

    console.log(`[WP Subscription] Lifecycle event monitoring would require webhook setup`);
  }

  /**
   * Check for stuck subscriptions
   * Subscriptions stuck in pending renewal or other problematic states
   */
  async checkStuckSubscriptions(sendAlert, wooCommerceAPI) {
    if (!this.isConfigured()) {
      return;
    }

    try {
      // Get recent orders that might be subscription renewals
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      
      // Look for orders with subscription metadata
      const { data: recentOrders } = await wooCommerceAPI.get("orders", {
        after: twentyFourHoursAgo,
        per_page: 50
      });

      let stuckSubscriptionCount = 0;
      const stuckSubscriptions = [];

      for (const order of recentOrders) {
        // Check if this is a subscription order
        const isSubscription = order.meta_data?.some(meta => 
          meta.key === '_subscription_id' || 
          meta.key === '_subscription_renewal'
        );

        if (isSubscription) {
          // Check for problematic statuses
          const problematicStatuses = ['pending', 'failed', 'on-hold'];
          const orderAgeHours = (new Date() - new Date(order.date_created)) / (1000 * 60 * 60);

          if (problematicStatuses.includes(order.status) && orderAgeHours > 2) {
            stuckSubscriptionCount++;
            stuckSubscriptions.push({
              id: order.id,
              status: order.status,
              ageHours: orderAgeHours.toFixed(1),
              total: order.total,
              customer: order.billing?.email || 'Unknown'
            });
          }
        }
      }

      if (stuckSubscriptionCount > 0) {
        const subscriptionList = stuckSubscriptions.map(sub => 
          `- Order #${sub.id}: ${sub.status} for ${sub.ageHours} hours (${sub.customer})`
        ).join('\n');

        await sendAlert(
          `Stuck Subscriptions on ${this.site.name}`,
          `${stuckSubscriptionCount} subscription order(s) stuck in problematic status:\n\n` +
          `${subscriptionList}\n\n` +
          `Check these orders and ensure subscription renewals are processing correctly.`
        );
      }

    } catch (error) {
      console.error(`[WP Subscription] Error checking stuck subscriptions:`, error.message);
    }
  }

  /**
   * Monitor subscription churn rate
   * Track cancellations vs new subscriptions
   */
  async monitorChurnRate(sendAlert, wooCommerceAPI) {
    if (!this.isConfigured()) {
      return;
    }

    try {
      // Get orders from last 7 days
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      
      const { data: recentOrders } = await wooCommerceAPI.get("orders", {
        after: sevenDaysAgo,
        per_page: 100,
        status: ['completed', 'processing', 'cancelled']
      });

      let newSubscriptions = 0;
      let cancelledSubscriptions = 0;

      for (const order of recentOrders) {
        const isSubscription = order.meta_data?.some(meta => 
          meta.key === '_subscription_id' || 
          meta.key === '_subscription_renewal'
        );

        if (isSubscription) {
          if (order.status === 'cancelled') {
            cancelledSubscriptions++;
          } else if (!order.meta_data?.some(meta => meta.key === '_subscription_renewal')) {
            // Not a renewal, so likely a new subscription
            newSubscriptions++;
          }
        }
      }

      // Calculate churn rate (simplified)
      if (newSubscriptions > 0 && cancelledSubscriptions > 0) {
        const churnRate = (cancelledSubscriptions / newSubscriptions) * 100;
        
        if (churnRate > 30) { // Alert if churn rate > 30%
          await sendAlert(
            `High Subscription Churn Rate on ${this.site.name}`,
            `High churn rate detected in the last 7 days:\n\n` +
            `New Subscriptions: ${newSubscriptions}\n` +
            `Cancelled Subscriptions: ${cancelledSubscriptions}\n` +
            `Churn Rate: ${churnRate.toFixed(1)}%\n\n` +
            `A churn rate above 30% may indicate issues with:\n` +
            `1. Product/service quality\n` +
            `2. Pricing strategy\n` +
            `3. Customer onboarding\n` +
            `4. Payment failure handling\n\n` +
            `Consider reviewing your subscription offering and customer experience.`
          );
        }
      }

      console.log(`[WP Subscription] Churn monitoring: ${newSubscriptions} new, ${cancelledSubscriptions} cancelled`);

    } catch (error) {
      console.error(`[WP Subscription] Error monitoring churn:`, error.message);
    }
  }
}

/**
 * Initialize WP Subscription monitoring for all configured sites
 */
async function initializeWPSubscriptionMonitoring(sites, sendAlert, wooCommerceAPIs) {
  const monitors = [];

  for (let i = 0; i < sites.length; i++) {
    const site = sites[i];
    const monitor = new WPSubscriptionMonitor(site);

    if (monitor.isConfigured()) {
      monitors.push({
        monitor,
        api: wooCommerceAPIs[i]
      });
      console.log(`[WP Subscription] Monitoring enabled for ${site.name}`);
    }
  }

  return monitors;
}

/**
 * Run WP Subscription health checks
 */
async function runWPSubscriptionChecks(monitors, sendAlert) {
  if (monitors.length === 0) {
    return;
  }

  console.log(`[WP Subscription] Running health checks for ${monitors.length} site(s)`);

  for (const { monitor, api } of monitors) {
    try {
      // 1. Check basic API connection
      await monitor.checkSubscriptionHealth(sendAlert);

      // 2. Check for stuck subscriptions
      await monitor.checkStuckSubscriptions(sendAlert, api);

      // 3. Monitor churn rate (weekly check)
      const now = new Date();
      if (now.getDay() === 1 && now.getHours() === 9) { // Monday at 9 AM
        await monitor.monitorChurnRate(sendAlert, api);
      }

    } catch (error) {
      console.error(`[WP Subscription] Error in health checks for ${monitor.site.name}:`, error.message);
    }
  }
}

module.exports = {
  WPSubscriptionMonitor,
  initializeWPSubscriptionMonitoring,
  runWPSubscriptionChecks
};