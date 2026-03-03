# 🚀 ManageWP Batch Installation Guide

## 📦 Perfect for ManageWP Installation!

Your plugin is **optimized for ManageWP** with auto-connect features that work perfectly with bulk installation.

## 🎯 Why ManageWP + Auto-Connect is Perfect

### 1. **Zero Configuration After Installation**
- ✅ Plugin auto-configures itself
- ✅ Connects to monitoring server automatically
- ✅ Sets smart defaults based on each store
- ✅ No manual settings needed

### 2. **Batch Installation Made Easy**
- ✅ Install on 1, 10, or 100+ stores at once
- ✅ All stores auto-connect to central dashboard
- ✅ Each gets unique store ID automatically
- ✅ Activation notifications sent immediately

### 3. **Centralized Monitoring**
- ✅ All stores appear in one dashboard: `https://woo.ashbi.ca/dashboard`
- ✅ Real-time alerts from all stores
- ✅ Health monitoring across all installations
- ✅ Subscription management for WPSubscription stores

## 🛠️ ManageWP Installation Steps

### Step 1: Prepare the Plugin ZIP
1. **Download**: `woo-comprehensive-monitor.zip` (from your local folder)
2. **Size**: 42.6KB (tiny, fast to upload)
3. **Version**: 3.0.0 with auto-connect

### Step 2: Upload to ManageWP
1. **Go to ManageWP Dashboard**
2. **Navigate to**: Plugins → Add New → Upload Plugin
3. **Upload**: `woo-comprehensive-monitor.zip`
4. **Plugin appears** in your ManageWP plugin library

### Step 3: Batch Install (2 Methods)

#### Method A: Install on Selected Sites
1. **Select sites** from your ManageWP dashboard
2. **Go to**: Plugins → Install
3. **Find**: "WooCommerce Comprehensive Monitor"
4. **Click**: Install & Activate
5. **Repeat** for all selected sites

#### Method B: Install on All WooCommerce Sites
1. **Filter sites** by "Has WooCommerce"
2. **Select all** WooCommerce sites
3. **Bulk action**: Install Plugin
4. **Choose**: "WooCommerce Comprehensive Monitor"
5. **Click**: Install & Activate on All

### Step 4: Monitor Installation Progress
1. **Watch ManageWP** for installation status
2. **Check central dashboard**: `https://woo.ashbi.ca/dashboard`
3. **Look for activation alerts** for each store
4. **Verify** all stores appear in dashboard

## 🎨 What Happens After Installation

### On Each Store:
1. **Auto-Configuration** (immediate):
   - Unique store ID generated
   - Monitoring server set to `https://woo.ashbi.ca/api/track-woo-error`
   - Error tracking enabled
   - Dispute protection auto-enabled if Stripe exists
   - Health monitoring scheduled

2. **Server Registration** (within 60 seconds):
   - Activation notice sent to monitoring server
   - Store appears in central dashboard
   - Ready to receive alerts

3. **Admin Notice** (WordPress admin):
   - Success message with store ID
   - Links to dashboard
   - Confirmation of connection

### In Central Dashboard:
1. **New Store Alert** for each installation
2. **Store Added** to monitoring list
3. **Health Check** initiated
4. **Ready for monitoring**

## 📊 Monitoring Your Batch Installation

### During Installation:
- **ManageWP Progress**: Shows installation status per site
- **Central Dashboard**: Watch for new store alerts
- **Email Notifications**: Activation alerts (if Mailgun configured)

### After Installation:
1. **Open Dashboard**: `https://woo.ashbi.ca/dashboard`
2. **Check Store Count**: Should match installations
3. **Verify Store IDs**: Each should be unique
4. **Test Connection**: Send test error from any store

## 🔧 Advanced ManageWP Features

### 1. **Scheduled Installation**
- Schedule installation during off-hours
- Stagger installations to avoid server load
- Set maintenance windows

### 2. **Update Management**
- Plugin updates appear in ManageWP
- One-click updates across all stores
- Version control and rollback

### 3. **Health Monitoring Integration**
- Combine with ManageWP's uptime monitoring
- Get alerts from both systems
- Comprehensive store health view

### 4. **Backup Integration**
- Schedule backups before installation
- Rollback capability if needed
- Safe installation process

## 🧪 Testing Before Full Deployment

### Recommended Test Process:
1. **Test on 1-2 stores** first
2. **Verify auto-connect works**
3. **Check central dashboard**
4. **Test error tracking**
5. **Then deploy to all stores**

### Test Commands (via ManageWP Backups):
```bash
# Check if plugin is active
wp plugin is-active woo-comprehensive-monitor

# Get store ID
wp option get wcm_store_id

# Test connection to monitoring server
wp eval "echo wp_remote_get('https://woo.ashbi.ca/api/health')['body'];"
```

## 📋 ManageWP Installation Checklist

### Before Installation:
- [ ] Download `woo-comprehensive-monitor.zip`
- [ ] Upload to ManageWP plugin library
- [ ] Select target stores (test first, then all)
- [ ] Inform store owners (optional)
- [ ] Check monitoring server is up

### During Installation:
- [ ] Monitor ManageWP progress
- [ ] Watch central dashboard for new stores
- [ ] Check for activation alerts
- [ ] Note any installation failures

### After Installation:
- [ ] Verify all stores in dashboard
- [ ] Check store IDs are unique
- [ ] Test error tracking on sample store
- [ ] Verify health checks are running
- [ ] Review admin notices on sample stores

## 🚀 Quick ManageWP Installation Script

If you want to automate via ManageWP API:

```bash
#!/bin/bash
# managewp-batch-install.sh

# ManageWP API credentials
API_KEY="your_managewp_api_key"
PLUGIN_SLUG="woo-comprehensive-monitor"

# Get all site IDs
SITE_IDS=$(curl -s -X GET "https://managewp.com/api/sites" \
  -H "Authorization: Bearer $API_KEY" | jq -r '.sites[].id')

# Install on all sites
for SITE_ID in $SITE_IDS; do
  curl -s -X POST "https://managewp.com/api/sites/$SITE_ID/plugins/install" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"plugin\": \"$PLUGIN_SLUG\", \"activate\": true}"
  
  echo "✅ Installed on site $SITE_ID"
done
```

## 📈 Post-Installation Verification

### 1. **Dashboard Verification**:
- Go to: `https://woo.ashbi.ca/dashboard`
- Check total stores matches installations
- Verify each store has unique ID
- Look for recent activation alerts

### 2. **Store-Specific Verification**:
- Pick 2-3 random stores
- Visit WordPress admin
- Check for welcome notice
- Verify plugin settings

### 3. **Functionality Test**:
- Trigger test error on one store
- Check if alert appears in dashboard
- Verify health check runs
- Test dispute protection (if Stripe)

## 🚨 Troubleshooting ManageWP Installation

### Common Issues & Solutions:

1. **Plugin Not Installing**:
   - Check file size (should be 42.6KB)
   - Verify ZIP file is not corrupted
   - Check ManageWP storage limits

2. **No Activation Alert**:
   - Wait 2-3 minutes (cron may be delayed)
   - Check `wcm_monitoring_server` option
   - Verify store can reach monitoring server

3. **Duplicate Store IDs**:
   - Extremely rare (time-based + hash)
   - Regenerate: `wp option delete wcm_store_id`
   - Reactivate plugin

4. **ManageWP Timeout**:
   - Install in smaller batches (10-20 stores)
   - Increase timeout in ManageWP settings
   - Schedule during low-traffic periods

### Debug via ManageWP:
1. **Check Installation Logs** in ManageWP
2. **View Plugin Status** on each site
3. **Check Error Logs** via ManageWP backups
4. **Test Connection** using ManageWP's "Run Code" feature

## 🎯 Best Practices for ManageWP

### 1. **Stagger Installation**:
- Install on 10-20 stores at a time
- Wait for activation alerts
- Monitor server load
- Continue with next batch

### 2. **Communication**:
- Notify store owners (optional)
- Explain benefits of monitoring
- Provide dashboard access if needed

### 3. **Documentation**:
- Keep list of installed stores
- Record store IDs
- Note any issues encountered
- Document resolution steps

### 4. **Monitoring**:
- Watch central dashboard during installation
- Set up alert thresholds
- Monitor server performance
- Track installation progress

## 📞 ManageWP Support Resources

### If You Need Help:
1. **ManageWP Support**: Excellent for installation issues
2. **Plugin Documentation**: `README.md` in plugin
3. **Central Dashboard**: Check activation status
4. **GitHub Issues**: For plugin-specific issues

### Useful Links:
- **ManageWP Dashboard**: Your ManageWP URL
- **Central Dashboard**: `https://woo.ashbi.ca/dashboard`
- **Plugin GitHub**: `https://github.com/camster91/woo-comprehensive-monitor`
- **Health Check**: `https://woo.ashbi.ca/api/health`

## 🎉 Ready for ManageWP Batch Installation!

### Your Plugin is Optimized For:
✅ **One-click installation** via ManageWP  
✅ **Auto-connect** to central monitoring  
✅ **Zero configuration** required  
✅ **Batch installation** on unlimited stores  
✅ **Real-time monitoring** from activation  
✅ **Comprehensive features** ready immediately  

### Quick Start:
1. **Upload** `woo-comprehensive-monitor.zip` to ManageWP
2. **Select** your WooCommerce stores
3. **Click** Install & Activate
4. **Watch** stores appear in `https://woo.ashbi.ca/dashboard`
5. **Monitor** all stores from one dashboard

**You're ready to batch install on all your stores!** 🚀

---

**Pro Tip**: Install on 2-3 test stores first to verify everything works, then deploy to all stores. The auto-connect features make this process seamless!