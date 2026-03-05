# 🔍 Debugging "Plugin could not be activated because it triggered a fatal error"

## **Why This Happens**
When you upload v4.4.8 via WordPress admin:
1. WordPress deactivates the old plugin
2. Deletes old files
3. Uploads new files
4. **Runs `activate()` method** ← Can fail here
5. Shows generic error message (hides actual error)

## **How to Find the Actual Error**

### **Option 1: Enable WordPress Debugging**
Add to `wp-config.php` (above `/* That's all, stop editing! */`):
```php
define('WP_DEBUG', true);
define('WP_DEBUG_LOG', true);
define('WP_DEBUG_DISPLAY', false);
@ini_set('display_errors', 0);
```

Then try activating again. Check:
- **Error log**: `wp-content/debug.log`
- **Browser console**: F12 → Console
- **PHP error log**: Ask hosting provider

### **Option 2: Check Existing Logs**
```php
// Add to functions.php temporarily
error_log('=== ACTIVATION ERROR CHECK ===');
error_log(print_r(error_get_last(), true));
```

### **Option 3: Test with Minimal Setup**
1. Switch to default theme (Twenty Twenty-Four)
2. Disable all other plugins
3. Try activation again
4. Re-enable plugins/theme one by one

## **Common Causes**

### **1. Database Permissions**
Plugin creates 5 tables. If MySQL user lacks:
- `CREATE` permission
- `ALTER` permission (for `dbDelta()`)
- Enough disk space

**Fix**: Contact hosting provider to verify permissions.

### **2. PHP Memory Limit**
```php
// Check current limit
echo ini_get('memory_limit'); // Should be at least 256M
```

**Fix**: Add to `wp-config.php`:
```php
define('WP_MEMORY_LIMIT', '256M');
define('WP_MAX_MEMORY_LIMIT', '512M');
```

### **3. PHP Timeout**
Activation takes >30 seconds (creating tables).

**Fix**: Increase timeout:
```php
set_time_limit(60); // 60 seconds
```

### **4. Plugin Conflict**
Another plugin hooks into activation process.

**Fix**: Test with plugins disabled.

### **5. Corrupted ZIP File**
Download failed or ZIP corrupted.

**Fix**: Re-download from GitHub:
```bash
curl -L -o plugin.zip https://github.com/camster91/woo-comprehensive-monitor/releases/download/v4.4.8/woo-comprehensive-monitor-v4.4.8.zip
sha256sum plugin.zip # Should match: ac6a588951bf0b332578c07836c9caaf5b16219b204699db323b0751bde7c67a
```

## **Immediate Solution: Manual Update**
Since plugin is **already active (v4.4.1)**, bypass activation entirely:

### **Via FTP/SFTP:**
1. **Don't deactivate** plugin
2. **Replace files** directly in `/wp-content/plugins/woo-comprehensive-monitor/`
3. Plugin stays active, no activation hook triggered
4. Version updates on next page load

[See MANUAL-UPDATE-GUIDE.md for detailed steps]

## **If Manual Update Not Possible**

### **Option A: Use WP-CLI (SSH required)**
```bash
wp plugin install https://github.com/camster91/woo-comprehensive-monitor/releases/download/v4.4.8/woo-comprehensive-monitor-v4.4.8.zip --force --activate
```

### **Option B: WordPress Auto-Updater**
1. First fix the activation error (enable debug, find cause)
2. Or clean Action Scheduler tasks **before** update (they might be causing timeout)
3. Then try update via admin again

### **Option C: One-Click Fix Script**
Create `fix-activation.php` in plugin root:
```php
<?php
// Bypass activation by manually setting version
update_option('wcm_plugin_version', '4.4.8');
echo 'Version updated to 4.4.8. Now replace files manually.';
```

## **Prevention for Future Updates**

### **Enable Auto-Updater in v4.4.8**
After successful update:
1. Go to **Settings → Advanced**
2. Enable **"Automatic Updates"**
3. Enable **"Create Backups Before Updates"**
4. Future updates will use safe auto-updater

### **Configure Error Logging**
```php
// In wp-config.php (permanent)
define('WP_DEBUG_LOG', true);
define('WP_DEBUG', false); // Don't show on live site
```

## **Get Help**

### **Share Error Details:**
1. **Error message** from `debug.log`
2. **PHP version** (`php -v`)
3. **WordPress version**
4. **WooCommerce version**
5. **List of active plugins**

### **Support Channels:**
- **Dashboard AI Chat**: https://woo.ashbi.ca/dashboard → "💬 DeepSeek Chat"
- **Email**: cameron@ashbi.ca
- **GitHub Issues**: https://github.com/camster91/woo-comprehensive-monitor/issues

## **Quick Checklist**
- [ ] Enable `WP_DEBUG_LOG` to see actual error
- [ ] Check `wp-content/debug.log`
- [ ] Verify PHP memory limit ≥ 256M
- [ ] Check database permissions
- [ ] Try manual update via FTP
- [ ] Share error details with support

---

**Remember**: The plugin **works fine** when active (v4.4.1). The issue is only during **activation phase** of update. Manual file replacement avoids this entirely.