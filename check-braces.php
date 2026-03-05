<?php
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
];

foreach ($files as $file) {
    if (!file_exists($file)) {
        echo "$file: NOT FOUND\n";
        continue;
    }
    
    $content = file_get_contents($file);
    
    // Check PHP tags
    $php_open = substr_count($content, '<?php');
    $php_close = substr_count($content, '?>');
    echo "$file: PHP open=$php_open, close=$php_close\n";
    
    // Check braces
    $braces_open = substr_count($content, '{');
    $braces_close = substr_count($content, '}');
    echo "  Braces: open=$braces_open, close=$braces_close, diff=" . ($braces_open - $braces_close) . "\n";
    
    // Check parentheses
    $paren_open = substr_count($content, '(');
    $paren_close = substr_count($content, ')');
    echo "  Parens: open=$paren_open, close=$paren_close, diff=" . ($paren_open - $paren_close) . "\n";
    
    // Check brackets
    $bracket_open = substr_count($content, '[');
    $bracket_close = substr_count($content, ']');
    echo "  Brackets: open=$bracket_open, close=$bracket_close, diff=" . ($bracket_open - $bracket_close) . "\n";
    
    echo "\n";
}
?>