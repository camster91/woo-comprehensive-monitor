<?php
/**
 * Verification script for v4.4.8 changes
 * Run this in a WordPress environment to verify key features
 */

echo "=== WooCommerce Comprehensive Monitor v4.4.8 Verification ===\n\n";

// 1. Check core files exist
$required_files = [
    'woo-comprehensive-monitor.php',
    'includes/class-wcm-health-monitor.php',
    'includes/class-wcm-error-tracker.php',
    'includes/class-wcm-admin-dashboard.php',
    'admin/settings.php',
    'assets/js/admin.js',
    'server/server.js',
];

echo "1. Checking required files:\n";
foreach ($required_files as $file) {
    if (file_exists(__DIR__ . '/' . $file)) {
        echo "  ✓ $file\n";
    } else {
        echo "  ✗ $file (MISSING)\n";
    }
}

// 2. Check for key functions
echo "\n2. Checking for key functions in health monitor:\n";
$health_content = file_get_contents(__DIR__ . '/includes/class-wcm-health-monitor.php');
$functions_to_check = [
    'fix_action_scheduler',
    'ajax_fix_action_scheduler',
    'get_actionable_fixes',
    'send_cleanup_notification',
    'check_stripe_gateway',
];

foreach ($functions_to_check as $function) {
    if (strpos($health_content, "function $function") !== false) {
        echo "  ✓ $function()\n";
    } else {
        echo "  ✗ $function() (MISSING)\n";
    }
}

// 3. Check error tracker improvements
echo "\n3. Checking error tracker improvements:\n";
$error_content = file_get_contents(__DIR__ . '/includes/class-wcm-error-tracker.php');
$error_features = [
    'should_suppress_error' => 'Error suppression patterns',
    'get_error_groups' => 'Error grouping',
    'get_error_trends' => 'Error trends',
    'cleanup_old_errors' => 'Automatic cleanup',
];

foreach ($error_features as $function => $description) {
    if (strpos($error_content, "function $function") !== false) {
        echo "  ✓ $description\n";
    } else {
        echo "  ✗ $description (MISSING)\n";
    }
}

// 4. Check admin dashboard enhancements
echo "\n4. Checking admin dashboard enhancements:\n";
$dashboard_content = file_get_contents(__DIR__ . '/includes/class-wcm-admin-dashboard.php');
if (strpos($dashboard_content, 'wcm-fix-issue') !== false) {
    echo "  ✓ Fix issue buttons\n";
} else {
    echo "  ✗ Fix issue buttons (MISSING)\n";
}

if (strpos($dashboard_content, 'get_actionable_fixes') !== false) {
    echo "  ✓ Actionable fixes display\n";
} else {
    echo "  ✗ Actionable fixes display (MISSING)\n";
}

// 5. Check settings page updates
echo "\n5. Checking settings page updates:\n";
$settings_content = file_get_contents(__DIR__ . '/admin/settings.php');
if (strpos($settings_content, 'wcm_suppress_error_patterns') !== false) {
    echo "  ✓ Error suppression patterns setting\n";
} else {
    echo "  ✗ Error suppression patterns setting (MISSING)\n";
}

// 6. Check ZIP file
echo "\n6. Checking release assets:\n";
if (file_exists(__DIR__ . '/woo-comprehensive-monitor-v4.4.8.zip')) {
    $size = filesize(__DIR__ . '/woo-comprehensive-monitor-v4.4.8.zip');
    echo "  ✓ ZIP file exists (" . round($size/1024) . " KB)\n";
} else {
    echo "  ✗ ZIP file missing\n";
}

// 7. Check server enhancements
echo "\n7. Checking server enhancements:\n";
$server_content = file_get_contents(__DIR__ . '/server/server.js');
$server_features = [
    'errorCounts' => 'Error deduplication',
    'lastAlertTimes' => 'Alert cooldown',
    'DIAGNOSTIC SUGGESTIONS' => 'Diagnostic suggestions',
    'jQuery Compatibility Issue' => 'jQuery error detection',
];

foreach ($server_features as $pattern => $description) {
    if (strpos($server_content, $pattern) !== false) {
        echo "  ✓ $description\n";
    } else {
        echo "  ✗ $description (MISSING)\n";
    }
}

echo "\n=== Verification Complete ===\n";
echo "If all checks pass, v4.4.8 is ready for deployment.\n";
echo "Key features:\n";
echo "• One-click Action Scheduler cleanup\n";
echo "• WP-Cron repair\n";
echo "• Stripe detection fix\n";
echo "• Error suppression patterns\n";
echo "• Smart alerting with diagnostics\n";
echo "• Batch processing for large sites\n";
echo "• AI Chat integration\n";