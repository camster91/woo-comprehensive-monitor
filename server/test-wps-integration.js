/**
 * Test script for WP Subscription Integration
 * 
 * This script tests the WP Subscription integration module
 * without starting the full server.
 */

const { WPSubscriptionMonitor } = require('./wp-subscription-integration.js');

// Test configuration
const testSite = {
  id: 1,
  name: "Test Store",
  url: "https://teststore.com",
  consumerKey: "ck_test",
  consumerSecret: "cs_test",
  wpsEnabled: true,
  wpsApiKey: "test_api_key"
};

// Mock sendAlert function for testing
const mockSendAlert = async (subject, message) => {
  console.log(`[Mock Alert] Subject: ${subject}`);
  console.log(`[Mock Alert] Message: ${message}`);
  return true;
};

// Mock WooCommerce API for testing
const mockWooCommerceAPI = {
  get: async (endpoint, params) => {
    console.log(`[Mock API] GET ${endpoint}`, params);
    
    // Return mock data based on endpoint
    if (endpoint === "orders") {
      return {
        data: [
          {
            id: 1234,
            status: 'pending',
            date_created: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
            meta_data: [
              { key: '_subscription_id', value: 'sub_123' },
              { key: '_subscription_renewal', value: 'yes' }
            ],
            billing: { email: 'test@example.com' },
            total: '29.99'
          },
          {
            id: 1235,
            status: 'completed',
            date_created: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
            meta_data: [
              { key: '_subscription_id', value: 'sub_124' }
            ],
            billing: { email: 'test2@example.com' },
            total: '49.99'
          }
        ]
      };
    }
    
    return { data: [] };
  }
};

async function runTests() {
  console.log('=== WP Subscription Integration Tests ===\n');
  
  // Test 1: Create monitor instance
  console.log('Test 1: Creating WPSubscriptionMonitor instance');
  const monitor = new WPSubscriptionMonitor(testSite);
  
  console.log(`- Site: ${monitor.site.name}`);
  console.log(`- API URL: ${monitor.apiUrl}`);
  console.log(`- Configured: ${monitor.isConfigured()}`);
  console.log(`- Enabled: ${monitor.enabled}`);
  
  // Test 2: Check configuration
  console.log('\nTest 2: Configuration check');
  if (monitor.isConfigured()) {
    console.log('✓ WP Subscription is configured');
  } else {
    console.log('✗ WP Subscription is not configured (using default API key)');
  }
  
  // Test 3: Test connection (will fail with mock data)
  console.log('\nTest 3: Testing API connection');
  const connection = await monitor.verifyConnection();
  console.log(`- Success: ${connection.success}`);
  if (connection.error) {
    console.log(`- Error: ${connection.error}`);
  }
  
  // Test 4: Test stuck subscription detection
  console.log('\nTest 4: Testing stuck subscription detection');
  await monitor.checkStuckSubscriptions(mockSendAlert, mockWooCommerceAPI);
  
  // Test 5: Test churn rate monitoring
  console.log('\nTest 5: Testing churn rate monitoring');
  await monitor.monitorChurnRate(mockSendAlert, mockWooCommerceAPI);
  
  // Test 6: Test subscription health check
  console.log('\nTest 6: Testing subscription health check');
  await monitor.checkSubscriptionHealth(mockSendAlert);
  
  console.log('\n=== Tests Complete ===');
  console.log('\nNote: These tests use mock data. For real testing:');
  console.log('1. Update testSite with real API credentials');
  console.log('2. Ensure WP Subscription Pro is installed and API enabled');
  console.log('3. Run the full monitoring server for integrated testing');
}

// Run tests
runTests().catch(error => {
  console.error('Test error:', error);
});