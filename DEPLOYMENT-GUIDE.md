# 🚀 WooCommerce Comprehensive Monitor v4.4.4 Deployment Guide

## 📊 Current Status
- **Live Store**: 4EVRstrong (https://4evrstrong.com)
- **Current Plugin**: v4.4.1
- **Target Plugin**: v4.4.4
- **Monitoring Server**: v2.3.0 (https://woo.ashbi.ca)
- **Stripe Warning**: Currently showing "Stripe Gateway is not active" (will be logged to dashboard after update)

## 🎯 Goals for v4.4.4 Deployment

### 1. **Fix Alert Email**
- Default alert email now set to `cameron@ashbi.ca`
- All plugin alerts will go to this address

### 2. **Admin Notice Logging**
- Stripe warnings logged to monitoring server
- All admin notices sent to dashboard
- View notices at: https://woo.ashbi.ca/api/dashboard

### 3. **Auto-Updater Ready**
- Safe auto-updater with backup & rollback
- Compatibility checks before updates
- Major update confirmation system

### 4. **Enhanced Dashboard**
- Shows admin notices from stores
- Real-time error tracking
- Store statistics and feature usage

## 📦 Deployment Options

### Option A: **Auto-Update (Recommended)**
The store should auto-update within 12 hours via WordPress updates:
1. Plugin checks GitHub every 12 hours
2. Downloads v4.4.4 ZIP from GitHub releases
3. Runs compatibility checks
4. Creates automatic backup
5. Updates via WordPress update system
6. Re-activates automatically

### Option B: **Manual Update (Immediate)**
1. Download `woo-comprehensive-monitor-v4.4.4.zip` from:
   - Dashboard: https://woo.ashbi.ca/dashboard → Plugin tab
   - Direct: `\\tmp\pi-github-repos\camster91\woo-comprehensive-monitor\woo-comprehensive-monitor-v4.4.4.zip`
2. WordPress Admin → Plugins → Installed Plugins
3. Find "WooCommerce Comprehensive Monitor"
4. Click **Update Now**
5. OR: Deactivate → Delete → Add New → Upload Plugin → Install → Activate

### Option C: **ManageWP Batch Update**
1. Upload `woo-comprehensive-monitor-v4.4.4.zip` to ManageWP plugin library
2. Select all WooCommerce stores
3. Click Install & Activate
4. All stores auto-connect to monitoring server

## 🔧 Post-Update Verification

### 1. **Check Plugin Version**
- WordPress Admin → Plugins → Installed Plugins
- Should show "Version 4.4.4"

### 2. **Verify Auto-Update Settings**
- WordPress Admin → WooCommerce → Comprehensive Monitor → Advanced tab
- Auto Updates: ✅ Enabled
- Create Backup: ✅ Enabled  
- Check Compatibility: ✅ Enabled
- Major Updates: Auto (recommended)

### 3. **Test Monitoring Connection**
- Settings → General tab → "Test Connection" button
- Should show: "Connected! Server v2.3.0 — 1 store monitored."

### 4. **Check Admin Notices**
- Stripe warning should now be **logged to dashboard** instead of just showing
- View at: https://woo.ashbi.ca/api/dashboard
- Look for `admin_notices` array in store data

### 5. **Test Error Tracking**
- Visit store frontend
- Trigger a JavaScript error (open console, type `throw new Error('test')`)
- Error should appear in dashboard alerts

## 🐛 Expected Behavior After Update

### **Stripe Warning Fix**
- **Before**: "Stripe Gateway is not active" warning in WordPress admin
- **After**: Warning still shows BUT also logged to monitoring server
- **Result**: I can see the warning in dashboard and help debug

### **Alert Email Fix**
- **Before**: Alerts sent to site admin email
- **After**: All alerts sent to `cameron@ashbi.ca`
- **Settings**: Can be changed in Advanced tab

### **Auto-Updater Active**
- Plugin will auto-update from GitHub releases
- Backups created before updating
- Rollback available if issues occur

## 📋 Testing Checklist

### Immediate Tests:
- [ ] Plugin updates successfully to v4.4.4
- [ ] Auto-update settings saved correctly
- [ ] Monitoring connection works
- [ ] Stripe warning appears in dashboard admin_notices
- [ ] Alert emails go to cameron@ashbi.ca

### Functional Tests:
- [ ] Error tracking works (frontend JS errors)
- [ ] Health monitoring active
- [ ] Dispute protection settings saved
- [ ] Pre-order system settings saved
- [ ] Price protection settings saved

### Safety Tests:
- [ ] Auto-updater can fetch GitHub releases
- [ ] Backup creation works (if enabled)
- [ ] Compatibility check works
- [ ] Rollback function accessible

## 🚨 Troubleshooting

### If Auto-Update Doesn't Work:
1. Check WordPress update cron: `wp cron event list`
2. Check GitHub API access: `curl https://api.github.com/repos/camster91/woo-comprehensive-monitor/releases/latest`
3. Manual update via Option B

### If Stripe Warning Persists:
1. Check WooCommerce → Settings → Payments → Stripe
2. Verify Stripe gateway is enabled
3. Check Stripe plugin version (should be v10.4.0+)

### If Connection Fails:
1. Verify monitoring server: https://woo.ashbi.ca/api/health