# 🚀 Batch Installation Guide for WooCommerce Comprehensive Monitor

## 📦 Overview

This guide shows you how to **batch install** the plugin on multiple WooCommerce stores with **auto-connect** to your monitoring server.

## 🎯 Features for Batch Installation

### Auto-Connect on Activation:
1. **Automatic Configuration**: Sets monitoring server URL automatically
2. **Store ID Generation**: Creates unique store identifier
3. **Smart Defaults**: Enables features based on environment
4. **Activation Notice**: Sends notification to monitoring server
5. **Welcome Message**: Shows success notice in WordPress admin

### No Manual Configuration Needed:
- ✅ Monitoring server pre-configured
- ✅ Error tracking enabled by default
- ✅ Dispute protection auto-enabled if Stripe exists
- ✅ Health monitoring scheduled
- ✅ Store registered in central dashboard

## 🛠️ Batch Installation Methods

### Method 1: WordPress CLI (Recommended for Multiple Stores)

```bash
# Install on single store
wp plugin install woo-comprehensive-monitor.zip --activate

# Install on multiple stores (using list of URLs)
for store in "https://store1.com" "https://store2.com" "https://store3.com"; do
  wp --url="$store" plugin install woo-comprehensive-monitor.zip --activate
done
```

### Method 2: SSH/Shell Script

```bash
#!/bin/bash
# batch-install.sh

STORES=(
  "https://store1.com"
  "https://store2.com" 
  "https://store3.com"
)

PLUGIN_ZIP="woo-comprehensive-monitor.zip"

for STORE in "${STORES[@]}"; do
  echo "Installing on $STORE..."
  
  # Download plugin if not exists
  if [ ! -f "$PLUGIN_ZIP" ]; then
    wget -O "$PLUGIN_ZIP" "https://github.com/camster91/woo-comprehensive-monitor/releases/download/v3.0.0/woo-comprehensive-monitor.zip"
  fi
  
  # Install and activate
  wp --url="$STORE" plugin install "$PLUGIN_ZIP" --activate --quiet
  
  echo "✅ Installed on $STORE"
done

echo "🎉 Batch installation complete!"
```

### Method 3: ManageWP/InfiniteWP (Managed WordPress)

1. **Upload plugin** to your management dashboard
2. **Select all stores** where you want to install
3. **Install and activate** in bulk
4. **Plugin auto-connects** to monitoring server

### Method 4: cPanel/File Manager

1. **Upload** `woo-comprehensive-monitor.zip` to each site
2. **Extract** to `/wp-content/plugins/`
3. **Activate** from WordPress admin
4. **Plugin auto-configures** itself

## 🔧 Environment-Based Configuration

### Custom Monitoring Server (Optional):
```bash
# Set custom monitoring server via environment variable
export WCM_MONITORING_SERVER="https://your-monitoring-server.com/api/track-woo-error"

# Or define in wp-config.php
define('WCM_MONITORING_SERVER', 'https://your-monitoring-server.com/api/track-woo-error');
```

### Default Configuration:
- **Monitoring Server**: `https://woo.ashbi.ca/api/track-woo-error`
- **Error Tracking**: Enabled (JS, AJAX, checkout)
- **Dispute Protection**: Auto-enabled if Stripe gateway exists
- **Health Monitoring**: Hourly checks scheduled
- **Email Alerts**: Admin email used by default

## 📊 What Happens on Activation

### 1. Database Setup:
- Creates necessary tables for errors, disputes, health logs
- Sets up scheduled events (cron jobs)

### 2. Auto-Configuration:
- Generates unique store ID
- Sets monitoring server URL
- Configures default settings
- Checks for Stripe gateway

### 3. Server Registration:
- Sends activation notice to monitoring server
- Store appears in central dashboard
- Ready to receive alerts

### 4. Admin Notice:
- Shows success message with store ID
- Provides links to dashboard
- Confirms connection status

## 🧪 Testing Batch Installation

### Test Script:
```bash
#!/bin/bash
# test-batch-install.sh

# Test stores (use local/test environments)
TEST_STORES=(
  "http://localhost/store1"
  "http://localhost/store2"
)

for STORE in "${TEST_STORES[@]}"; do
  echo "Testing installation on $STORE..."
  
  # Check if WordPress is installed
  if wp --url="$STORE" core is-installed; then
    # Install plugin
    wp --url="$STORE" plugin install woo-comprehensive-monitor.zip --activate --quiet
    
    # Verify installation
    if wp --url="$STORE" plugin is-active woo-comprehensive-monitor; then
      echo "✅ Success: $STORE"
      
      # Get store ID
      STORE_ID=$(wp --url="$STORE" option get wcm_store_id)
      echo "   Store ID: $STORE_ID"
    else
      echo "❌ Failed: $STORE"
    fi
  else
    echo "⚠️  Skip: $STORE (WordPress not found)"
  fi
done
```

## 📈 Monitoring Batch Installation

### Central Dashboard:
After batch installation, check:
1. **Dashboard**: `https://woo.ashbi.ca/dashboard`
2. **Store List**: All installed stores should appear
3. **Activation Alerts**: Success notifications for each store
4. **Health Status**: Initial health checks should run

### What to Look For:
- ✅ Store appears in dashboard
- ✅ Activation alert received
- ✅ Store ID matches WordPress option
- ✅ Initial health check completed
- ✅ No error alerts (unless real issues)

## 🔄 Update Existing Installations

### Batch Update Script:
```bash
#!/bin/bash
# batch-update.sh

STORES=(
  "https://store1.com"
  "https://store2.com"
)

for STORE in "${STORES[@]}"; do
  echo "Updating $STORE..."
  
  # Deactivate old version
  wp --url="$STORE" plugin deactivate woo-comprehensive-monitor --quiet
  
  # Delete old version
  wp --url="$STORE" plugin delete woo-comprehensive-monitor --quiet
  
  # Install new version
  wp --url="$STORE" plugin install woo-comprehensive-monitor.zip --activate --quiet
  
  echo "✅ Updated $STORE"
done
```

## 🚨 Troubleshooting Batch Installation

### Common Issues:

1. **Plugin Not Activating**:
   ```bash
   # Check WordPress CLI access
   wp --url="https://store.com" plugin list
   
   # Check permissions
   wp --url="https://store.com" cap list
   ```

2. **No Activation Alert**:
   - Check monitoring server is accessible
   - Verify `wcm_monitoring_server` option
   - Check WordPress cron is working

3. **Store Not in Dashboard**:
   - Wait 1-2 minutes for activation notice
   - Check server logs for activation request
   - Verify store ID is unique

4. **Multiple Stores Same ID**:
   - Each store should have unique ID
   - Regenerate ID: `wp option delete wcm_store_id`
   - Reactivate plugin

### Debug Commands:
```bash
# Check plugin status
wp plugin status woo-comprehensive-monitor

# Check options
wp option get wcm_store_id
wp option get wcm_monitoring_server
wp option get wcm_auto_connected

# Test connection
wp eval "echo wp_remote_get('https://woo.ashbi.ca/api/health')['body'];"
```

## 🎯 Best Practices for Batch Installation

### 1. **Test First**:
- Install on 1-2 test stores first
- Verify everything works
- Then proceed with batch

### 2. **Use Staging**:
- Test on staging environments
- Fix any issues
- Deploy to production

### 3. **Monitor Progress**:
- Watch central dashboard during installation
- Check for activation alerts
- Verify store appearances

### 4. **Document Results**:
- Keep list of installed stores
- Note any issues encountered
- Record store IDs for reference

### 5. **Schedule Maintenance**:
- Plan updates during low traffic
- Notify store owners
- Have rollback plan

## 📋 Installation Checklist

### Before Batch Installation:
- [ ] Download latest plugin ZIP
- [ ] Test on single store
- [ ] Verify monitoring server is up
- [ ] Prepare store list
- [ ] Backup existing installations

### During Installation:
- [ ] Monitor central dashboard
- [ ] Watch for activation alerts
- [ ] Check for errors
- [ ] Verify store IDs

### After Installation:
- [ ] Confirm all stores in dashboard
- [ ] Test error tracking
- [ ] Verify health checks
- [ ] Check dispute protection (if Stripe)
- [ ] Review admin notices

## 🚀 Quick Start Command

### One-Liner for Multiple Stores:
```bash
# Install on 3 stores
for url in "https://store1.com" "https://store2.com" "https://store3.com"; do
  wp --url="$url" plugin install woo-comprehensive-monitor.zip --activate --quiet && 
  echo "✅ $url" || echo "❌ $url"
done
```

### With Progress Bar:
```bash
#!/bin/bash
# install-with-progress.sh

STORES=($(cat stores.txt))  # List of store URLs in file
TOTAL=${#STORES[@]}
COUNT=0

for STORE in "${STORES[@]}"; do
  ((COUNT++))
  PERCENT=$((COUNT * 100 / TOTAL))
  
  echo -ne "Installing... $PERCENT% ($COUNT/$TOTAL)\r"
  
  wp --url="$STORE" plugin install woo-comprehensive-monitor.zip --activate --quiet > /dev/null 2>&1
  
  sleep 1  # Rate limiting
done

echo -e "\n🎉 Installation complete! $TOTAL stores configured."
```

## 📞 Support

If you encounter issues with batch installation:

1. **Check Logs**:
   - WordPress debug.log
   - Monitoring server logs
   - Installation script output

2. **Verify Requirements**:
   - WordPress 5.6+
   - WooCommerce 5.0+
   - PHP 7.4+
   - WordPress CLI access

3. **Test Manually**:
   - Install on one store manually
   - Check configuration
   - Verify connection

4. **Contact Support**:
   - GitHub Issues: https://github.com/camster91/woo-comprehensive-monitor/issues
   - Check documentation
   - Review troubleshooting guide

## 🎉 Ready for Batch Installation!

Your plugin is now **batch-installation ready** with:

✅ **Auto-connect** to monitoring server  
✅ **Zero configuration** required  
✅ **Smart defaults** based on environment  
✅ **Activation notifications** to dashboard  
✅ **Welcome messages** for admins  
✅ **Unique store IDs** generated automatically  
✅ **Compatible** with all installation methods  

**Start batch installing now!** 🚀