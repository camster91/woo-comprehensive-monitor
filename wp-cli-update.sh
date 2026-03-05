#!/bin/bash

# WP-CLI Update Script for WooCommerce Comprehensive Monitor v4.4.8
# Run this on your server via SSH (requires WP-CLI)

echo "=== WP-CLI Update: v4.4.1 → v4.4.8 ==="
echo ""

# Check if WP-CLI is available
if ! command -v wp &> /dev/null; then
    echo "❌ WP-CLI not found. Install from: https://wp-cli.org/"
    exit 1
fi

# Get current plugin status
echo "Checking current plugin..."
CURRENT_VERSION=$(wp plugin get woo-comprehensive-monitor --field=version 2>/dev/null || echo "not installed")
STATUS=$(wp plugin get woo-comprehensive-monitor --field=status 2>/dev/null || echo "not installed")

echo "Current version: $CURRENT_VERSION"
echo "Status: $STATUS"
echo ""

# Download v4.4.8
echo "Downloading v4.4.8 from GitHub..."
DOWNLOAD_URL="https://github.com/camster91/woo-comprehensive-monitor/releases/download/v4.4.8/woo-comprehensive-monitor-v4.4.8.zip"
TEMP_ZIP="/tmp/woo-comprehensive-monitor-v4.4.8.zip"

if command -v curl &> /dev/null; then
    curl -L -o "$TEMP_ZIP" "$DOWNLOAD_URL"
elif command -v wget &> /dev/null; then
    wget -O "$TEMP_ZIP" "$DOWNLOAD_URL"
else
    echo "❌ Neither curl nor wget found. Please download manually."
    exit 1
fi

if [ ! -f "$TEMP_ZIP" ]; then
    echo "❌ Failed to download ZIP file."
    exit 1
fi

echo "✅ Downloaded: $(du -h "$TEMP_ZIP" | cut -f1)"
echo ""

# Update plugin using WP-CLI (deactivates, installs new, activates)
echo "Updating plugin via WP-CLI..."
wp plugin install "$TEMP_ZIP" --force --activate 2>&1 | while read line; do
    echo "  $line"
done

UPDATE_RESULT=$?

# Clean up
rm -f "$TEMP_ZIP"

if [ $UPDATE_RESULT -eq 0 ]; then
    echo ""
    echo "✅ Plugin updated successfully!"
    
    # Verify version
    NEW_VERSION=$(wp plugin get woo-comprehensive-monitor --field=version)
    echo "New version: $NEW_VERSION"
    
    # Check for Action Scheduler tasks
    echo ""
    echo "Checking Action Scheduler status..."
    wp db query "SELECT COUNT(*) as total_tasks, SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_tasks FROM $(wp db prefix)actionscheduler_actions" --skip-column-names 2>/dev/null || echo "Could not check Action Scheduler"
    
    echo ""
    echo "=== Next Steps ==="
    echo "1. Clean failed tasks: WooCommerce → WC Monitor → Health Checks → 'Clean Failed Tasks'"
    echo "2. Configure error suppression: Settings → Error Tracking"
    echo "3. Test AI Chat: https://woo.ashbi.ca/dashboard → '💬 DeepSeek Chat'"
    
else
    echo ""
    echo "❌ WP-CLI update failed with exit code: $UPDATE_RESULT"
    echo ""
    echo "=== Fallback Options ==="
    echo "1. Manual update via FTP (see MANUAL-UPDATE-GUIDE.md)"
    echo "2. Download ZIP and upload via WordPress admin"
    echo "3. Contact support: cameron@ashbi.ca"
fi