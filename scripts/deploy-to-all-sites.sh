#!/bin/bash
# Deploy WCM plugin to all WooCommerce sites on Hostinger
# Usage: ./deploy-to-all-sites.sh
#
# This script:
# 1. Downloads the latest plugin ZIP from GitHub
# 2. Installs on each site
# 3. Configures monitoring server + store ID
# 4. Sets DISABLE_WP_CRON in wp-config.php
# 5. Verifies site is still up after install

PLUGIN_ZIP_URL="https://github.com/camster91/woo-comprehensive-monitor/releases/latest/download/woo-comprehensive-monitor-v4.5.9.zip"
MONITORING_SERVER="https://woo.ashbi.ca/api/track-woo-error"
WP_BASE="/home/u633679196/domains"

# Download plugin ZIP once
echo "=== Downloading plugin ZIP ==="
cd /tmp
curl -sL -o wcm-latest.zip "$PLUGIN_ZIP_URL"
if [ ! -f wcm-latest.zip ]; then
    echo "FAILED to download plugin ZIP"
    exit 1
fi
echo "Downloaded: $(ls -la wcm-latest.zip)"

# Get list of all WP sites with WooCommerce
SITES=$(ls -d $WP_BASE/*/public_html/wp-config.php 2>/dev/null | while read f; do
    dir=$(dirname "$f")
    site=$(echo "$dir" | sed "s|$WP_BASE/||;s|/public_html||")
    cd "$dir" && wp plugin is-active woocommerce 2>/dev/null && echo "$site"
done)

echo ""
echo "=== Sites to deploy: ==="
echo "$SITES" | wc -l
echo "$SITES"
echo ""

for SITE in $SITES; do
    WP_DIR="$WP_BASE/$SITE/public_html"
    PLUGIN_DIR="$WP_DIR/wp-content/plugins/woo-comprehensive-monitor"

    echo "--- $SITE ---"

    # Skip if already installed and up to date
    if [ -f "$PLUGIN_DIR/woo-comprehensive-monitor.php" ]; then
        CURRENT=$(cd "$WP_DIR" && wp eval 'echo WCM_VERSION;' 2>/dev/null)
        if [ "$CURRENT" = "4.5.9" ]; then
            echo "  Already v4.5.9, skipping install"
        else
            echo "  Upgrading from $CURRENT to 4.5.9"
            rm -rf "$PLUGIN_DIR"
            cd "$WP_DIR/wp-content/plugins" && unzip -qo /tmp/wcm-latest.zip -d woo-comprehensive-monitor
        fi
    else
        # Remove any old versions
        rm -rf "$WP_DIR/wp-content/plugins/woo-comprehensive-monitor"*
        cd "$WP_DIR/wp-content/plugins" && unzip -qo /tmp/wcm-latest.zip -d woo-comprehensive-monitor
        echo "  Installed"
    fi

    # Activate
    cd "$WP_DIR" && wp plugin activate woo-comprehensive-monitor 2>/dev/null

    # Generate store ID from site name hash
    STORE_ID=$(echo -n "$SITE" | md5sum | cut -c1-8)
    STORE_ID="store-$STORE_ID"

    # Configure
    cd "$WP_DIR"
    wp option update wcm_monitoring_server "$MONITORING_SERVER" 2>/dev/null
    wp option update wcm_store_id "$STORE_ID" 2>/dev/null

    # Schedule crons if missing
    wp eval '
    if (!wp_next_scheduled("wcm_daily_health_check")) wp_schedule_event(time() + rand(0,3600), "twicedaily", "wcm_daily_health_check");
    if (!wp_next_scheduled("wcm_hourly_dispute_check")) wp_schedule_event(time() + rand(0,3600), "hourly", "wcm_hourly_dispute_check");
    if (!wp_next_scheduled("wcm_daily_log_cleanup")) wp_schedule_event(time() + rand(0,3600), "daily", "wcm_daily_log_cleanup");
    ' 2>/dev/null

    # Set DISABLE_WP_CRON if not already set
    if ! grep -q "DISABLE_WP_CRON" "$WP_DIR/wp-config.php"; then
        sed -i "/\/\* That's all, stop editing!/i\\define('DISABLE_WP_CRON', true);" "$WP_DIR/wp-config.php"
        echo "  Added DISABLE_WP_CRON"
    fi

    # Verify site is up
    HTTP_CODE=$(curl -sL -o /dev/null -w "%{http_code}" --max-time 10 "https://$SITE/" 2>/dev/null)
    if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "301" ] || [ "$HTTP_CODE" = "302" ]; then
        echo "  Site UP ($HTTP_CODE) | Store ID: $STORE_ID"
    else
        echo "  WARNING: Site returned $HTTP_CODE — check manually!"
    fi

    echo ""
done

echo "=== Done ==="
echo "All sites deployed. Run system cron setup next."
