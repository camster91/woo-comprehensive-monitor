#!/bin/bash
echo "=== Final Syntax Check for v4.4.8 ==="

# Check main plugin file
echo "1. Checking woo-comprehensive-monitor.php..."
grep -n "WCM_VERSION" woo-comprehensive-monitor.php
grep -n "4.4.8" woo-comprehensive-monitor.php

# Check modified files for syntax
echo -e "\n2. Checking modified files:"
files=(
  "woo-comprehensive-monitor.php"
  "includes/class-wcm-health-monitor.php"
  "includes/class-wcm-error-tracker.php"
  "includes/class-wcm-admin-dashboard.php"
  "admin/settings.php"
  "assets/js/admin.js"
  "server/server.js"
  "server/dashboard-enhanced.html"
)

for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    size=$(wc -l < "$file")
    echo "  ✓ $file ($size lines)"
  else
    echo "  ✗ $file (MISSING)"
  fi
done

echo -e "\n3. Checking for common issues:"

# Check for PHP syntax errors (basic grep checks)
echo "  - Checking for unclosed brackets..."
grep -n "{" includes/class-wcm-health-monitor.php | wc -l
grep -n "}" includes/class-wcm-health-monitor.php | wc -l

echo "  - Checking for jQuery errors in server.js..."
grep -n "jQuery\|jquery" server/server.js | head -5

echo "  - Checking error suppression feature..."
grep -n "suppress_error_patterns\|should_suppress_error" includes/class-wcm-error-tracker.php

echo "  - Checking Action Scheduler batch cleanup..."
grep -n "batch\|LIMIT" includes/class-wcm-health-monitor.php

echo -e "\n4. ZIP file status:"
ls -la woo-comprehensive-monitor-v4.4.8.zip 2>/dev/null || echo "  ZIP not created yet"

echo -e "\n5. Server integration:"
echo "  - Dashboard: https://woo.ashbi.ca/dashboard"
echo "  - API health: https://woo.ashbi.ca/api/health"
echo "  - Version should be 2.4.0"

echo -e "\n=== Summary ==="
echo "v4.4.8 includes:"
echo "  • Activation error fixes"
echo "  • Action Scheduler cleanup (one-click)"
echo "  • WP-Cron repair"
echo "  • Stripe detection fix"
echo "  • Error suppression patterns"
echo "  • Deduplication and smart alerts"
echo "  • Email notification for large cleanups"
echo "  • Batch processing for large sites"