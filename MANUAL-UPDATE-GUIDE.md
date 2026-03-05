# 🔧 Manual Update Guide: v4.4.1 → v4.4.8 (Without Activation Hook)

## **⚠️ Problem**
When you upload v4.4.8 via WordPress admin, it:
1. Deactivates the old plugin
2. Deletes the old files
3. Installs new files
4. **Runs activation hook** → Can cause "Plugin could not be activated because it triggered a fatal error"

## **✅ Solution: Manual File Replacement (FTP/SFTP)**
Replace plugin files directly **without** triggering activation hook.

### **Step 1: Download v4.4.8**
- Download: [woo-comprehensive-monitor-v4.4.8.zip](https://github.com/camster91/woo-comprehensive-monitor/releases/download/v4.4.8/woo-comprehensive-monitor-v4.4.8.zip)
- Extract ZIP on your computer

### **Step 2: Connect to Your WordPress Site**
**Via FTP/SFTP:**
- **Host**: Your server IP/hostname
- **Username/Password**: Your FTP credentials
- **Path**: `/wp-content/plugins/woo-comprehensive-monitor/`

**Via cPanel File Manager:**
1. Login to cPanel → File Manager
2. Navigate to: `public_html/wp-content/plugins/woo-comprehensive-monitor/`

**Via SSH (if available):**
```bash
cd /path/to/wordpress/wp-content/plugins/woo-comprehensive-monitor
```

### **Step 3: Backup Current Plugin (Optional)**
```bash
# Via SSH
cp -r woo-comprehensive-monitor woo-comprehensive-monitor-backup-v4.4.1

# Or download via FTP before replacing
```

### **Step 4: Replace Files**
**Method A: Replace Entire Plugin Folder**
1. Rename current folder: `woo-comprehensive-monitor` → `woo-comprehensive-monitor-old`
2. Upload extracted `woo-comprehensive-monitor` folder
3. **Plugin stays active** - WordPress will detect file changes

**Method B: Replace Individual Files**
Upload these changed files from v4.4.8 ZIP:

| File | Changes |
|------|---------|
| `woo-comprehensive-monitor.php` | Version bump, activation fixes |
| `includes/class-wcm-health-monitor.php` | Action Scheduler cleanup |
| `includes/class-wcm-error-tracker.php` | Error suppression, deduplication |
| `includes/class-wcm-admin-dashboard.php` | Actionable fixes section |
| `admin/settings.php` | Error suppression patterns setting |
| `assets/js/admin.js` | Fix issue handlers |
| `server/dashboard-enhanced.html` | Updated version references |

### **Step 5: Verify Update**
1. **WordPress Admin** → Plugins
2. See "WooCommerce Comprehensive Monitor" still **Active**
3. Version should show **4.4.8** (hover over plugin name)
4. Go to **WooCommerce** → **WC Monitor** → **Health Checks**
5. Click **"Clean Failed Tasks"** to fix 2351 Action Scheduler tasks

## **🔍 How It Works**
- **Manual replacement** doesn't trigger `register_activation_hook()`
- Plugin **stays active** during file replacement
- `init_components()` runs on next page load, detects version change (4.4.1 → 4.4.8)
- `upgrade_plugin()` handles any necessary migrations (none needed)
- No table creation, no activation errors

## **🔄 What Happens on Next Page Load**
```php
// In init_components():
$stored_version = get_option('wcm_plugin_version', '0'); // 4.4.1
$current_version = WCM_VERSION; // 4.4.8

if ($stored_version < $current_version) {
    $this->upgrade_plugin($stored_version, $current_version); // Updates cron jobs
    update_option('wcm_plugin_version', $current_version); // Saves 4.4.8
}
```

## **🎯 Benefits of Manual Update**
- ✅ **No activation hook** = no fatal errors
- ✅ **Zero downtime** - plugin stays active
- ✅ **No data loss** - settings preserved
- ✅ **Immediate update** - files replace instantly
- ✅ **Fallback option** - keep old folder as backup

## **⚠️ Important Notes**
1. **Don't deactivate plugin** before replacing files
2. **Keep plugin active** throughout the process
3. **Upload all files** - not just changed ones (or use Method A)
4. **Clear cache** if using caching plugins after update

## **📞 Troubleshooting**

### **If Plugin Shows Wrong Version:**
1. Clear WordPress object cache
2. Check `wp_options` table: `SELECT * FROM wp_options WHERE option_name = 'wcm_plugin_version';`
3. Should be `4.4.8`

### **If Features Don't Appear:**
1. Check browser console for JavaScript errors
2. Clear browser cache (Ctrl+Shift+R)
3. Verify files were uploaded correctly

### **If Still Issues:**
1. Rename plugin folder back to original
2. Contact support with error details

## **🚀 Post-Update Steps**
After successful manual update:

1. **Clean Action Scheduler tasks** (Health Checks → "Clean Failed Tasks")
2. **Configure error suppression** (Settings → Error Tracking → Add patterns)
3. **Test AI Chat** (Dashboard → "💬 DeepSeek Chat")
4. **Verify auto-updater** (Settings → Advanced → Auto-updates enabled)

## **🔒 Security Note**
- Use secure FTP (SFTP) not plain FTP
- Keep backup of old version for 24 hours
- Verify file permissions after upload (644 for files, 755 for folders)

## **📊 File Comparison**
```
v4.4.1 (Current)                 v4.4.8 (New)
-------------------              -------------------
35 files, ~85KB                  35 files, ~112KB
Same database schema             Same database schema  
Same settings                    + Error suppression
Same error tracking              + Smart deduplication
                                 + Action Scheduler cleanup
                                 + AI Chat integration
                                 + Auto-updater safety
```

## **🎉 Success Verification**
```bash
# Check version via WP-CLI (if available)
wp plugin list | grep comprehensive

# Or check database
echo "SELECT option_value FROM wp_options WHERE option_name = 'wcm_plugin_version';" | mysql -u username -p database
```

---

**Update Method**: Manual file replacement (recommended)  
**Risk Level**: Low (files only, no activation)  
**Time Required**: 5-10 minutes  
**Support**: cameron@ashbi.ca or Dashboard AI Chat