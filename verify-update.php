<?php
/**
 * Verification script for manual update v4.4.1 → v4.4.8
 * Place this in plugin root and access via browser or WP-CLI
 */

// Prevent direct access
if (!defined('ABSPATH')) {
    // If accessed directly, try to find WordPress
    $wp_path = dirname(dirname(dirname(dirname(__FILE__))));
    if (file_exists($wp_path . '/wp-load.php')) {
        require_once($wp_path . '/wp-load.php');
    } else {
        die('Cannot find WordPress. Place this file in plugin root and access via browser.');
    }
}

echo "<h2>WooCommerce Comprehensive Monitor Update Verification</h2>";
echo "<p>Checking update from v4.4.1 → v4.4.8...</p>";
echo "<hr>";

// Check if plugin is active
if (!function_exists('wcm')) {
    echo "<p style='color: red;'>❌ Plugin main function 'wcm()' not found. Plugin may not be loaded.</p>";
} else {
    echo "<p style='color: green;'>✅ Plugin main function loaded.</p>";
}

// Check version
$stored_version = get_option('wcm_plugin_version', '0');
$plugin_data = get_plugin_data(__DIR__ . '/woo-comprehensive-monitor.php');
$current_version = $plugin_data['Version'] ?? 'unknown';

echo "<p>Stored version in database: <strong>" . esc_html($stored_version) . "</strong></p>";
echo "<p>Current plugin file version: <strong>" . esc_html($current_version) . "</strong></p>";

if ($stored_version === '4.4.8' && $current_version === '4.4.8') {
    echo "<p style='color: green;'>✅ Version 4.4.8 successfully updated!</p>";
} elseif ($stored_version === '4.4.1' && $current_version === '4.4.8') {
    echo "<p style='color: orange;'>⚠️ Files updated to 4.4.8 but database still shows 4.4.1.</p>";
    echo "<p>This is normal after manual file replacement. Version will update on next page load.</p>";
    echo "<p><a href='" . admin_url('admin.php?page=woo-comprehensive-monitor') . "'>Click here to load admin page and trigger version update</a></p>";
} else {
    echo "<p style='color: red;'>❌ Version mismatch. Expected 4.4.8.</p>";
}

echo "<hr>";

// Check for required files
$required_files = array(
    'woo-comprehensive-monitor.php',
    'includes/class-wcm-health-monitor.php',
    'includes/class-wcm-error-tracker.php',
    'includes/class-wcm-admin-dashboard.php',
);

echo "<h3>File Check</h3>";
foreach ($required_files as $file) {
    $path = __DIR__ . '/' . $file;
    if (file_exists($path)) {
        $size = filesize($path);
        echo "<p style='color: green;'>✅ " . esc_html($file) . " (" . round($size/1024) . " KB)</p>";
        
        // Check for v4.4.8 specific features
        if ($file === 'includes/class-wcm-health-monitor.php') {
            $content = file_get_contents($path);
            if (strpos($content, 'fix_action_scheduler') !== false) {
                echo "<p style='color: green; margin-left: 20px;'>✓ Action Scheduler cleanup feature present</p>";
            }
        }
        if ($file === 'includes/class-wcm-error-tracker.php') {
            $content = file_get_contents($path);
            if (strpos($content, 'should_suppress_error') !== false) {
                echo "<p style='color: green; margin-left: 20px;'>✓ Error suppression feature present</p>";
            }
        }
    } else {
        echo "<p style='color: red;'>❌ " . esc_html($file) . " (MISSING)</p>";
    }
}

echo "<hr>";

// Check database tables
global $wpdb;
$tables = array(
    $wpdb->prefix . 'wcm_error_logs',
    $wpdb->prefix . 'wcm_health_logs',
    $wpdb->prefix . 'wcm_recovery_log',
    $wpdb->prefix . 'woo_subscription_acknowledgments',
    $wpdb->prefix . 'wcm_dispute_evidence',
);

echo "<h3>Database Tables</h3>";
foreach ($tables as $table) {
    $exists = $wpdb->get_var("SHOW TABLES LIKE '$table'") === $table;
    if ($exists) {
        $count = $wpdb->get_var("SELECT COUNT(*) FROM $table");
        echo "<p style='color: green;'>✅ " . esc_html($table) . " (" . intval($count) . " rows)</p>";
    } else {
        echo "<p style='color: orange;'>⚠️ " . esc_html($table) . " (does not exist)</p>";
    }
}

echo "<hr>";

// Check Action Scheduler status
echo "<h3>Action Scheduler Status</h3>";
$as_table = $wpdb->prefix . 'actionscheduler_actions';
$as_exists = $wpdb->get_var("SHOW TABLES LIKE '$as_table'") === $as_table;
if ($as_exists) {
    $failed = $wpdb->get_var("SELECT COUNT(*) FROM $as_table WHERE status = 'failed'");
    $total = $wpdb->get_var("SELECT COUNT(*) FROM $as_table");
    
    echo "<p>Total tasks: " . intval($total) . "</p>";
    echo "<p>Failed tasks: <strong>" . intval($failed) . "</strong></p>";
    
    if ($failed > 0) {
        echo "<p style='color: orange;'>⚠️ There are " . intval($failed) . " failed Action Scheduler tasks.</p>";
        echo "<p>After updating to v4.4.8, go to <strong>WooCommerce → WC Monitor → Health Checks</strong> and click <strong>\"Clean Failed Tasks\"</strong></p>";
    } else {
        echo "<p style='color: green;'>✅ No failed Action Scheduler tasks.</p>";
    }
} else {
    echo "<p style='color: orange;'>⚠️ Action Scheduler table not found (normal if WooCommerce Subscriptions not installed).</p>";
}

echo "<hr>";

// Provide next steps
echo "<h3>Next Steps</h3>";
echo "<ol>";
echo "<li><strong>Clean Action Scheduler tasks</strong> (if any failed): WooCommerce → WC Monitor → Health Checks → \"Clean Failed Tasks\"</li>";
echo "<li><strong>Configure error suppression</strong> (optional): Settings → Error Tracking → \"Suppress Error Patterns\"</li>";
echo "<li><strong>Test AI Chat</strong>: Visit <a href='https://woo.ashbi.ca/dashboard' target='_blank'>Dashboard</a> → \"💬 DeepSeek Chat\" tab</li>";
echo "<li><strong>Verify auto-updater</strong>: Settings → Advanced → Ensure auto-updates enabled</li>";
echo "</ol>";

echo "<hr>";
echo "<p><strong>Update Method:</strong> Manual file replacement</p>";
echo "<p><strong>Status:</strong> " . ($stored_version === '4.4.8' ? '✅ Complete' : '🔄 In Progress') . "</p>";
echo "<p><strong>Support:</strong> <a href='https://woo.ashbi.ca/dashboard' target='_blank'>Dashboard AI Chat</a> or email cameron@ashbi.ca</p>";

// If accessed via command line, output plain text
if (php_sapi_name() === 'cli') {
    ob_start();
    echo "WooCommerce Comprehensive Monitor Update Verification\n";
    echo "===================================================\n";
    echo "Stored version: $stored_version\n";
    echo "Current version: $current_version\n";
    echo "\n";
    
    if ($stored_version === '4.4.8') {
        echo "✅ Update successful!\n";
    } elseif ($stored_version === '4.4.1') {
        echo "⚠️ Files updated but version not yet updated in database.\n";
        echo "   Load any admin page to trigger version update.\n";
    }
    
    echo "\n";
    echo "Next steps:\n";
    echo "1. Clean Action Scheduler tasks: WooCommerce → WC Monitor → Health Checks\n";
    echo "2. Configure error suppression in settings (optional)\n";
    echo "3. Test AI Chat at https://woo.ashbi.ca/dashboard\n";
    
    $plain = ob_get_clean();
    echo strip_tags($plain);
}