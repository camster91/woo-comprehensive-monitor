#!/bin/bash

echo "=== Verification Script for WooCommerce Comprehensive Monitor v4.4.8 ==="
echo "Run this after installing the plugin on your WordPress site."
echo ""

# Check if curl is available
if ! command -v curl &> /dev/null; then
    echo "⚠️ curl not found. Please install curl first."
    exit 1
fi

echo "1. Checking monitoring server health..."
SERVER_HEALTH=$(curl -s "https://woo.ashbi.ca/api/health")
if echo "$SERVER_HEALTH" | grep -q '"status":"ok"'; then
    echo "✅ Server is healthy"
    VERSION=$(echo "$SERVER_HEALTH" | grep -o '"version":"[^"]*"' | cut -d'"' -f4)
    echo "   Version: $VERSION"
else
    echo "❌ Server health check failed"
    echo "   Response: $SERVER_HEALTH"
fi

echo ""
echo "2. Checking dashboard availability..."
DASHBOARD_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "https://woo.ashbi.ca/dashboard")
if [ "$DASHBOARD_RESPONSE" = "200" ]; then
    echo "✅ Dashboard is accessible (HTTP 200)"
else
    echo "❌ Dashboard returned HTTP $DASHBOARD_RESPONSE"
fi

echo ""
echo "3. Checking error tracking endpoint..."
ERROR_RESPONSE=$(curl -s -X POST "https://woo.ashbi.ca/api/track-woo-error" \
  -H "Content-Type: application/json" \
  -d '{"type":"test_error","error_message":"Verification test","site":"verification.test"}' | grep -o '"success":true')
if [ "$ERROR_RESPONSE" = '"success":true' ]; then
    echo "✅ Error tracking endpoint is working"
else
    echo "❌ Error tracking endpoint failed"
fi

echo ""
echo "4. Checking AI chat endpoint..."
CHAT_RESPONSE=$(curl -s -X POST "https://woo.ashbi.ca/api/chat/deepseek" \
  -H "Content-Type: application/json" \
  -d '{"question":"test","storeId":"verification"}' | grep -o '"response"' || echo "fail")
if [ "$CHAT_RESPONSE" = '"response"' ]; then
    echo "✅ AI chat endpoint is working"
else
    echo "⚠️ AI chat endpoint may be in mock mode (expected without API key)"
fi

echo ""
echo "=== WordPress Plugin Verification ==="
echo "After installing the plugin:"
echo "1. Go to WooCommerce → WC Monitor → Health Checks"
echo "2. Look for 'Actionable Fixes' section"
echo "3. Click 'Clean Failed Tasks' to fix 2351 failed Action Scheduler tasks"
echo "4. Verify health score improves to >80%"
echo ""
echo "=== Error Alert Test ==="
echo "To test enhanced error alerts:"
echo "1. Visit any product page on your site"
echo "2. Open browser console (F12 → Console)"
echo "3. Type: throw new Error('Test error for monitoring');"
echo "4. Check email for alert with diagnostic suggestions"
echo ""
echo "=== Summary ==="
echo "If all checks above pass, your monitoring system is fully operational."
echo "Server: https://woo.ashbi.ca"
echo "Dashboard: https://woo.ashbi.ca/dashboard"
echo "Plugin Version: 4.4.8"
echo "Features: Error tracking, health monitoring, AI chat, Action Scheduler cleanup"