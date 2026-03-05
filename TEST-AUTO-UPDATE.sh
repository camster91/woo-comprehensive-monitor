#!/bin/bash
# Test auto-update functionality for WooCommerce Comprehensive Monitor

echo "🧪 Testing WooCommerce Comprehensive Monitor v4.4.4 Auto-Update"
echo "=========================================================="

# Check GitHub release exists
echo "1. Checking GitHub release..."
RELEASE_URL="https://api.github.com/repos/camster91/woo-comprehensive-monitor/releases/latest"
RELEASE_INFO=$(curl -s -H "Accept: application/vnd.github.v3+json" "$RELEASE_URL")

if echo "$RELEASE_INFO" | grep -q '"tag_name"'; then
    TAG_NAME=$(echo "$RELEASE_INFO" | grep '"tag_name"' | cut -d'"' -f4)
    echo "   ✅ Latest release: $TAG_NAME"
else
    echo "   ❌ Failed to fetch GitHub release"
    exit 1
fi

# Check ZIP download
echo "2. Checking ZIP download..."
ZIP_URL=$(echo "$RELEASE_INFO" | grep '"browser_download_url"' | head -1 | cut -d'"' -f4)
if [ -n "$ZIP_URL" ]; then
    echo "   ✅ ZIP URL: $(basename "$ZIP_URL")"
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -I "$ZIP_URL")
    if [ "$HTTP_CODE" = "200" ]; then
        echo "   ✅ ZIP accessible (HTTP $HTTP_CODE)"
    else
        echo "   ❌ ZIP not accessible (HTTP $HTTP_CODE)"
    fi
else
    echo "   ❌ No ZIP found in release"
    # Check if release exists but no ZIP attached
    echo "   ℹ️  You need to attach woo-comprehensive-monitor-v4.4.4.zip to GitHub release"
fi

# Check monitoring server
echo "3. Checking monitoring server..."
HEALTH=$(curl -s "https://woo.ashbi.ca/api/health")
if echo "$HEALTH" | grep -q '"status":"ok"'; then
    VERSION=$(echo "$HEALTH" | grep -o '"version":"[^"]*"' | cut -d'"' -f4)
    echo "   ✅ Server v$VERSION is healthy"
else
    echo "   ❌ Server not healthy"
fi

# Check current store status
echo "4. Checking store status..."
DASHBOARD=$(curl -s "https://woo.ashbi.ca/api/dashboard")
if echo "$DASHBOARD" | grep -q '"status":"ok"'; then
    STORE_COUNT=$(echo "$DASHBOARD" | grep -o '"totalSites":[0-9]*' | cut -d':' -f2)
    echo "   ✅ Dashboard shows $STORE_COUNT store(s)"
    
    # Extract store info
    echo "$DASHBOARD" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for store in data.get('stores', []):
    print(f'   Store: {store.get(\"name\", \"N/A\")}')
    print(f'     URL: {store.get(\"url\", \"N/A\")}')
    print(f'     Plugin: {store.get(\"plugin_version\", \"N/A\")}')
    print(f'     WooCommerce: {store.get(\"woocommerce_version\", \"N/A\")}')
    admin_notices = store.get(\"admin_notices\", [])
    print(f'     Admin Notices: {len(admin_notices)}')
    for notice in admin_notices[:3]:
        print(f'       - {notice.get(\"type\", \"?\")}: {notice.get(\"message\", \"?\")[:60]}...')
" 2>/dev/null || echo "   Could not parse store info"
else
    echo "   ❌ Could not fetch dashboard"
fi

echo ""
echo "📋 Summary:"
echo "----------"
echo "1. Create GitHub release v4.4.4 with attached ZIP if not done"
echo "2. Store should auto-update within 12 hours"
echo "3. Monitor dashboard for admin notices (Stripe warnings)"
echo "4. Alert emails will go to cameron@ashbi.ca"
echo ""
echo "📦 Manual update ZIP location:"
echo "   \\tmp\\pi-github-repos\\camster91\\woo-comprehensive-monitor\\woo-comprehensive-monitor-v4.4.4.zip"
echo ""
echo "🔗 GitHub Release URL:"
echo "   https://github.com/camster91/woo-comprehensive-monitor/releases/tag/v4.4.4"