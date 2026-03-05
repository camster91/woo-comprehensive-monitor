## v4.4.6 - Store ID Consistency Fix

### ✨ Fixes & Improvements
- Fixed store ID consistency (no longer changes on each activation)
- Server now properly updates store records with new versions
- Store ID based on site URL hash (consistent across updates)
- Auto-updates enabled by default (checks GitHub releases)
- Backup creation enabled by default before updates
- Compatibility checks before updates
- Default alert email set to cameron@ashbi.ca
- Admin notices logged to monitoring server
- Stripe warnings sent to dashboard for debugging

### 🐛 Critical Fixes
- Store ID no longer includes timestamp (was causing new ID on each activation)
- Server v2.3.1 updates existing store records when plugin reactivates
- Alert email defaults to cameron@ashbi.ca (was using admin_email)

### 📦 Installation
1. Download this ZIP file
2. WordPress Admin → Plugins → Add New → Upload Plugin
3. Install and activate
4. Plugin auto-connects to monitoring server: https://woo.ashbi.ca

### 🔗 Links
- **Dashboard**: https://woo.ashbi.ca/dashboard
- **Documentation**: https://github.com/camster91/woo-comprehensive-monitor
- **Live Store**: https://4evrstrong.com (currently v4.4.5, will auto-update)
