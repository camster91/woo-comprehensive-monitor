# WooCommerce Comprehensive Monitor & Dispute Protection

A comprehensive plugin that combines error tracking, dispute protection, and health monitoring for WooCommerce stores.

## Features

### 🚨 Error Tracking
- **JavaScript Error Tracking**: Catches uncaught JavaScript errors on WooCommerce pages
- **AJAX Error Tracking**: Monitors WooCommerce AJAX requests (add to cart, checkout, etc.)
- **Checkout Error Tracking**: Tracks checkout form validation and payment gateway errors
- **Real-time Reporting**: Sends errors to your central monitoring server in real-time

### 🛡️ Dispute Protection
- **Automatic Dispute Detection**: Integrates with Stripe webhooks to detect disputes immediately
- **Evidence Generation**: Automatically gathers order details, customer information, and subscription acknowledgments
- **Admin Dashboard**: View and manage all disputes from a single interface
- **Alert System**: Get notified when new disputes are detected

### 🏥 Health Monitoring
- **Comprehensive Health Checks**: 10+ different health checks for your WooCommerce store
- **Health Score**: Get an overall health score (0-100) for your store
- **Detailed Reports**: See exactly what needs attention
- **Scheduled Checks**: Automatically runs health checks on a schedule

### 📊 Admin Dashboard
- **Unified Dashboard**: See errors, disputes, and health status in one place
- **Real-time Updates**: Dashboard auto-refreshes every 60 seconds
- **Quick Actions**: Run health checks and send test alerts with one click
- **Detailed Logs**: View all errors, disputes, and health check results

## Installation

### Method 1: WordPress Admin
1. Download the latest release from [GitHub Releases](https://github.com/camster91/woo-comprehensive-monitor/releases)
2. Go to WordPress Admin → Plugins → Add New → Upload Plugin
3. Upload the `woo-comprehensive-monitor.zip` file
4. Activate the plugin

### Method 2: Manual Installation
1. Download the latest release ZIP file
2. Extract the contents to `/wp-content/plugins/woo-comprehensive-monitor/`
3. Activate the plugin through the 'Plugins' menu in WordPress

## Configuration

### 1. General Settings
1. Go to **WC Monitor → Settings**
2. Set your **Monitoring Server URL** (e.g., `https://woo.ashbi.ca/api/track-woo-error`)
3. Set your **Alert Email Address**
4. Click **Save Settings**

### 2. Stripe Webhook Setup (for Dispute Protection)
1. Go to your **Stripe Dashboard → Developers → Webhooks**
2. Click **Add endpoint**
3. Enter this URL: `https://your-site.com/wp-json/wcm/v1/stripe-webhook`
4. Select these events:
   - `charge.dispute.created`
   - `charge.dispute.updated`
   - `charge.dispute.closed`
5. Click **Add endpoint**

### 3. Error Tracking Configuration
1. Go to **WC Monitor → Settings → Error Tracking**
2. Enable the types of errors you want to track:
   - JavaScript errors
   - AJAX errors
   - Checkout errors
3. Click **Save Settings**

## Usage

### Dashboard
- **Main Dashboard**: WC Monitor → Dashboard
  - View store health score
  - See recent errors and disputes
  - Run health checks
  - Send test alerts

### Dispute Management
- **Disputes Page**: WC Monitor → Disputes
  - View all Stripe disputes
  - See automatically generated evidence
  - Check for new disputes

### Error Logs
- **Error Logs Page**: WC Monitor → Error Logs
  - View all tracked errors
  - Filter by error type
  - Clear logs when needed

### Health Checks
- **Health Page**: WC Monitor → Health Checks
  - View health check history
  - See detailed health score breakdown
  - Run manual health checks

## Health Checks Performed

The plugin performs the following health checks:

1. **WooCommerce System Status**
   - WooCommerce version
   - Required pages (shop, cart, checkout, myaccount)

2. **Stripe Gateway Status**
   - Gateway enabled/disabled
   - API keys configured
   - Test mode status

3. **Action Scheduler Status**
   - Pending actions count
   - Failed actions count
   - Oldest pending action age

4. **WordPress Cron Status**
   - WP-Cron enabled/disabled
   - Last cron run time

5. **SSL Certificate Status**
   - HTTPS enabled
   - SSL certificate validity

6. **Database Health**
   - Database size
   - WooCommerce sessions count
   - Orphaned orders

7. **Plugin & Theme Updates**
   - WordPress core updates
   - Plugin updates available
   - Theme updates available

8. **Server Resources**
   - PHP version
   - Memory limit
   - Max execution time

9. **API Connectivity**
   - Monitoring server connection
   - WooCommerce REST API accessibility

10. **Shipping & Tax Configuration**
    - Shipping zones configured
    - Tax calculation enabled
    - Prices include tax setting

## Alert Types

The plugin sends alerts for:

### Critical Issues
- Stripe gateway disconnected
- API connectivity issues
- High number of failed background tasks
- SSL certificate issues

### Warnings
- WooCommerce updates available
- Low memory limit
- No shipping zones configured
- Tax calculation disabled

### Errors
- JavaScript errors on checkout
- AJAX add to cart failures
- Checkout form validation errors
- Payment gateway errors

### Disputes
- New Stripe disputes detected
- Dispute evidence generated
- Dispute status updates

## Integration with Monitoring Server

The plugin sends data to your central monitoring server (like `https://woo.ashbi.ca`). The server should have endpoints to receive:

1. **Error Reports**: `POST /api/track-woo-error`
2. **Dispute Alerts**: `POST /api/track-woo-error` (with type: `dispute_created`)
3. **Health Alerts**: `POST /api/track-woo-error` (with type: `health_check_critical`)

## Requirements

- WordPress 5.6 or higher
- WooCommerce 5.0 or higher
- PHP 7.4 or higher
- MySQL 5.6 or higher

## Recommended Setup

### For Store Owners
1. Install this plugin on all your WooCommerce stores
2. Set up the central monitoring server (separate project)
3. Configure Stripe webhooks for dispute protection
4. Monitor all stores from the central dashboard

### For Developers
1. Clone the repository
2. Run `npm install` (for development)
3. Make your changes
4. Run `npm run build` to create production files
5. Create a ZIP file for distribution

## Development

### File Structure
```
woo-comprehensive-monitor/
├── admin/                    # Admin interface files
│   ├── settings.php         # Settings page
│   └── ...
├── assets/                  # CSS, JS, images
│   ├── css/
│   ├── js/
│   └── images/
├── includes/                # Core plugin classes
│   ├── class-wcm-dispute-manager.php
│   ├── class-wcm-error-tracker.php
│   ├── class-wcm-health-monitor.php
│   └── class-wcm-admin-dashboard.php
├── languages/               # Translation files
├── woo-comprehensive-monitor.php  # Main plugin file
└── README.md
```

### Hooks and Filters

#### Actions
- `wcm_error_reported` - Fires when an error is reported
- `wcm_dispute_detected` - Fires when a dispute is detected
- `wcm_health_check_completed` - Fires when health checks complete

#### Filters
- `wcm_error_data` - Filter error data before sending
- `wcm_dispute_evidence` - Filter dispute evidence data
- `wcm_health_check_results` - Filter health check results

## Support

For support, feature requests, or bug reports:
1. Check the [GitHub Issues](https://github.com/camster91/woo-comprehensive-monitor/issues)
2. Create a new issue if needed
3. Include WooCommerce and WordPress version information

## License

GPL v2 or later

## Credits

Developed by [Ashbi](https://ashbi.ca)

## Changelog

### 3.0.0
- Initial release
- Combined error tracking, dispute protection, and health monitoring
- Comprehensive admin dashboard
- Real-time error reporting
- Automatic dispute evidence generation
- Scheduled health checks

## Roadmap

### Planned Features
- [ ] Slack/Discord integration for alerts
- [ ] SMS notifications for critical issues
- [ ] Performance monitoring
- [ ] Security scanning
- [ ] Backup status monitoring
- [ ] Multi-language support
- [ ] WooCommerce Analytics integration
- [ ] Custom health check creation
- [ ] API for third-party integrations