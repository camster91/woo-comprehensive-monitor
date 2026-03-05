<?php
// Test syntax of plugin files
$files = [
    'woo-comprehensive-monitor.php',
    'includes/class-wcm-helpers.php',
    'includes/class-wcm-dispute-manager.php',
    'includes/class-wcm-error-tracker.php',
    'includes/class-wcm-health-monitor.php',
    'includes/class-wcm-admin-dashboard.php',
    'includes/class-wcm-subscription-manager-wps.php',
    'includes/class-wcm-checkout.php',
    'includes/class-wcm-evidence-generator.php',
    'includes/class-wcm-subscription-protector.php',
    'includes/class-wcm-preorder.php',
    'admin/settings.php',
    'uninstall.php'
];

foreach ($files as $file) {
    if (file_exists($file)) {
        $output = shell_exec("php -l $file 2>&1");
        echo "$file: " . (strpos($output, 'No syntax errors') !== false ? 'OK' : 'ERROR') . "\n";
        if (strpos($output, 'No syntax errors') === false) {
            echo "  $output\n";
        }
    } else {
        echo "$file: NOT FOUND\n";
    }
}
?>