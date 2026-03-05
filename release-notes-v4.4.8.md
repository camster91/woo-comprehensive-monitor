**🚀 v4.4.8 - Action Scheduler Cleanup & Stripe Detection Fix**

## **Breaking Improvements**

### **1. Action Scheduler Cleanup (2351 Failed Tasks)**
- **One-click button** in Health Checks page
- **Batch processing** (1000 tasks per batch) for >5000 tasks
- **Email notifications** for large cleanups (>100 failed tasks or >1000 old tasks)
- **WP-Cron repair** reschedules missing cron events
- **DISABLE_WP_CRON detection** with actionable advice

### **2. Stripe Detection Fix**
- Health check now matches main plugin logic
- Checks multiple class names: `WC_Stripe`, `WC_Stripe_API`, `WooCommerce\Stripe\Gateway`
- Actually verifies WooCommerce gateway enabled status
- Removes false "Stripe disabled" warnings

### **3. Enhanced Error Tracking & Alerts**
- **Error suppression patterns** in settings (ignore common false positives)
- **5-minute deduplication** (same error on same page)
- **Diagnostic suggestions** based on error type
- **jQuery compatibility detection** in server alerts
- **Error groups & trends** analytics

### **4. AI Chat Integration**
- DeepSeek AI chat in dashboard (💬 DeepSeek Chat tab)
- Store-specific troubleshooting
- Mock responses for testing
- Ready for real DeepSeek API integration

### **5. Auto-Updater Enhancements**
- GitHub release checking every 12 hours
- Pre-update compatibility validation (PHP, WP, WooCommerce)
- Automatic backups to `wp-content/wcm-backups/`
- Configurable major update handling (auto/confirm/manual)

### **6. Activation Error Fixes**
- Comprehensive try-catch in `activate()` method
- Individual table creation (prevents `dbDelta()` parsing errors)
- Activation error admin notices with self-clearing timer
- Store ID consistency (hash-based, no timestamp)

## **Technical Details**
- **Server Version**: 2.4.0 (deployed to https://woo.ashbi.ca)
- **Plugin Size**: 112KB (35 files)
- **SHA256**: `ac6a588951bf0b332578c07836c9caaf5b16219b204699db323b0751bde7c67a`
- **Requirements**: WordPress 5.6+, WooCommerce 5.0+, PHP 7.4+

## **Installation**
1. Download ZIP from this release
2. WordPress → Plugins → Add New → Upload Plugin
3. Activate and clean failed Action Scheduler tasks

## **Support**
- Dashboard AI Chat: https://woo.ashbi.ca/dashboard → "💬 DeepSeek Chat"
- Email: cameron@ashbi.ca
- GitHub Issues: https://github.com/camster91/woo-comprehensive-monitor/issues