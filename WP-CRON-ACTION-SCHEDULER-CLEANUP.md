# 🔧 WP-Cron & Action Scheduler Cleanup Feature (v4.4.8)

## **The Problem**
Your store shows: **"2351 failed Action Scheduler tasks - affects scheduled tasks but not plugin core"**

This means WP-Cron (WordPress's scheduled task system) is broken, which affects:
- ✅ **Plugin functionality**: Health checks, dispute checks, log cleanups may not run
- ✅ **Auto-updates**: Plugin may not auto-update from GitHub
- ✅ **WooCommerce tasks**: Order emails, stock management, subscription renewals
- ✅ **Other plugins**: Any plugin using scheduled tasks

## **The Solution (v4.4.8)**
Created a comprehensive cleanup system with one-click fixes:

### **1. Action Scheduler Cleanup**
- **Cleans failed tasks** older than 7 days (2351 failed tasks → 0)
- **Cleans completed tasks** older than 30 days (reduces database bloat)
- **One-click button** in Health Checks page
- **Automatic** when health check runs (optional)

### **2. WP-Cron Repair**
- **Checks if DISABLE_WP_CRON** is set (external cron required)
- **Reschedules missing events** (health checks, dispute checks, log cleanups)
- **Tests cron spawning** (verifies WP-Cron works)

### **3. Stripe Detection Fix**
- **Fixed false "Stripe disabled" warning** in dashboard
- **Now matches main plugin logic** (checks multiple class names)
- **Actually checks WooCommerce settings** not just plugin presence

## **📥 Download & Install v4.4.8**
**[Download: woo-comprehensive-monitor-v4.4.8.zip](file:///tmp/pi-github-repos/camster91/woo-comprehensive-monitor/woo-comprehensive-monitor-v4.4.8.zip)** (87KB)

### **Installation Steps:**
1. **WordPress Admin** → Plugins → Deactivate current plugin (if active)
2. **Delete** the plugin (data preserved in database)
3. **Add New** → **Upload Plugin** → Choose `woo-comprehensive-monitor-v4.4.8.zip`
4. **Activate**

## **🔧 How to Use the Cleanup Feature**

### **Option A: One-Click Fix (Recommended)**
1. Go to **WooCommerce** → **WC Monitor** → **Health Checks**
2. Look for **"Action Required"** section with failed tasks
3. Click **"Clean Failed Tasks"** button
4. Wait 5 seconds → See results: "Cleaned X failed tasks"

### **Option B: Manual Fix via Health Check**
1. Run **Health Check** (button at top of Health Checks page)
2. System automatically detects failed Action Scheduler tasks
3. Shows actionable fix with button
4. Click to clean

### **Option C: Automatic Cleanup**
- Plugin **optionally** cleans old tasks when health check runs
- Configure in **Settings** → **Advanced** → **Automatic Cleanup**
- Default: Manual (click button when needed)

## **📊 What Gets Cleaned**

| Task Type | Age Threshold | Result |
|-----------|--------------|--------|
| **Failed tasks** | 7+ days old | Deleted (2351 → 0) |
| **Completed tasks** | 30+ days old | Deleted (reduces DB size) |
| **Canceled tasks** | 30+ days old | Deleted |
| **Pending tasks** | Kept | Scheduled future tasks preserved |

## **🛠️ WP-Cron Repair Features**

### **If DISABLE_WP_CRON is true:**
- ✅ Shows warning: "External cron job required"
- ✅ Links to setup instructions
- ✅ Doesn't break anything (external cron is better!)

### **If events missing:**
- ✅ Reschedules health checks (hourly)
- ✅ Reschedules dispute checks (hourly)  
- ✅ Reschedules log cleanup (daily)
- ✅ Verifies cron can spawn

## **🤖 Dashboard AI Integration**
The monitoring dashboard AI (v2.4.0) can now:
- ✅ **Diagnose WP-Cron issues** from health check data
- ✅ **Suggest specific fixes** (Action Scheduler cleanup vs WP-Cron repair)
- ✅ **Monitor results** after cleanup (failed tasks count)
- ✅ **Alert if issues persist** (email to `cameron@ashbi.ca`)

## **🚨 Important Notes**

### **Stripe Warning (Dashboard)**
- **Old**: Showed "Stripe disabled" even when enabled
- **New**: Fixed detection logic, checks actual WooCommerce settings
- **If actually disabled**: Shows link to WooCommerce → Settings → Payments → Stripe

### **Auto-Updates**
- WP-Cron broken = auto-updates may fail
- After cleanup, auto-updates work again
- Plugin checks GitHub every 12 hours

### **Performance Impact**
- **Before**: 2351 failed tasks slowing database queries
- **After**: Clean database, faster queries
- **Memory**: Minimal (single SQL DELETE query)

## **📈 Success Metrics**
After successful cleanup:
- [ ] **Failed tasks**: 2351 → < 50 (ideally 0)
- [ ] **Health score**: Improves (Action Scheduler status: Good)
- [ ] **WP-Cron**: Events rescheduled, health checks run
- [ ] **Auto-updates**: Functional (checks GitHub)
- [ ] **Dashboard**: No more "failed tasks" warning

## **🔍 Debugging**
If cleanup doesn't work:

1. **Check permissions**: Database user needs DELETE permission
2. **Check Action Scheduler tables**: Should exist (`wp_actionscheduler_actions`)
3. **Enable debug**: `wp-config.php`:
```php
define('WP_DEBUG', true);
define('WP_DEBUG_LOG', true);
```

4. **Manual SQL** (backup first):
```sql
-- Clean failed tasks >7 days
DELETE FROM wp_actionscheduler_actions 
WHERE status = 'failed' 
AND scheduled_date_gmt < DATE_SUB(NOW(), INTERVAL 7 DAY);
```

## **🎯 Next Steps**
1. **Install v4.4.8** (includes activation error fixes from v4.4.7)
2. **Go to Health Checks** → Click "Clean Failed Tasks"
3. **Run Health Check** to verify fix
4. **Check dashboard** (failed tasks should be 0)
5. **Enable Stripe** if actually disabled (WooCommerce → Settings → Payments)

## **📞 Support**
- **Dashboard AI**: [https://woo.ashbi.ca/dashboard](https://woo.ashbi.ca/dashboard) → "💬 DeepSeek Chat"
- **Plugin settings**: WooCommerce → WC Monitor → Settings
- **Health checks**: WooCommerce → WC Monitor → Health Checks
- **Email alerts**: `cameron@ashbi.ca` (default, already set)

**Plugin Version**: v4.4.8  
**Server Version**: v2.4.0 (AI chat enabled)  
**Dashboard**: [https://woo.ashbi.ca/dashboard](https://woo.ashbi.ca/dashboard)  
**Last Updated**: March 4, 2026 08:00 EST