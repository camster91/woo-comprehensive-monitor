<?php
// Simple syntax check for woo-comprehensive-monitor.php
$content = file_get_contents('woo-comprehensive-monitor.php');

// Check for common issues
$issues = [];

// 1. Check for unclosed strings or heredocs
$lines = explode("\n", $content);
$in_string = false;
$string_char = '';
$heredoc_label = '';

foreach ($lines as $i => $line) {
    $line_num = $i + 1;
    
    // Check for unclosed PHP tags (though not critical)
    if (preg_match('/<\?(?!php)/', $line)) {
        $issues[] = "Line $line_num: Short PHP tag <? used, should use <?php";
    }
    
    // Simple string balance check (very basic)
    $single_quotes = substr_count($line, "'");
    $double_quotes = substr_count($line, '"');
    $backticks = substr_count($line, '`');
    
    // Check for unescaped quotes in strings (very basic)
    if (preg_match('/[^\\\\]\'[^\']*[^\\\\]\'/', $line) && $single_quotes % 2 != 0) {
        $issues[] = "Line $line_num: Possible unclosed single quote";
    }
}

// Check specific known issues
if (strpos($content, 'ON UPDATE CURRENT_TIMESTAMP') !== false) {
    $issues[] = "Found 'ON UPDATE CURRENT_TIMESTAMP' which causes dbDelta() issues";
}

// Check for missing semicolons at end of lines (basic)
preg_match_all('/\b(?:echo|return|throw|break|continue|yield)[^;]\s*$/m', $content, $matches, PREG_OFFSET_CAPTURE);
foreach ($matches[0] as $match) {
    $pos = $match[1];
    $line_num = substr_count(substr($content, 0, $pos), "\n") + 1;
    $issues[] = "Line $line_num: Possible missing semicolon after statement";
}

if (empty($issues)) {
    echo "✅ No obvious syntax issues found.\n";
    echo "Note: This is a basic check. Use php -l for full validation.\n";
} else {
    echo "⚠️ Possible issues found:\n";
    foreach ($issues as $issue) {
        echo "  - $issue\n";
    }
}

// Also check specific functions we modified
echo "\n🔍 Checking modified functions:\n";

// Check generate_store_id function
if (strpos($content, 'generate_store_id()') !== false) {
    echo "✅ generate_store_id() function exists\n";
    
    // Check for timestamp in function
    if (strpos($content, ". '-' . time()") !== false || strpos($content, ".'-'.time()") !== false) {
        echo "❌ generate_store_id() still includes timestamp (should be removed in v4.4.6)\n";
    } else {
        echo "✅ generate_store_id() doesn't include timestamp (good for v4.4.6)\n";
    }
}

// Check auto_configure_plugin for store ID default
if (strpos($content, "'wcm_store_id' => get_option('wcm_store_id',") !== false) {
    echo "✅ wcm_store_id uses get_option() with default\n";
}

// Check send_activation_notice for store_id
if (strpos($content, "'store_id' => get_option('wcm_store_id'),") !== false) {
    echo "✅ send_activation_notice() uses get_option('wcm_store_id')\n";
}

echo "\n📊 Stats:\n";
echo "File size: " . strlen($content) . " bytes\n";
echo "Lines: " . count($lines) . "\n";
echo "WCM_VERSION: ";
if (preg_match("/define\('WCM_VERSION', '([^']+)'/", $content, $version_match)) {
    echo $version_match[1] . "\n";
} else {
    echo "Not found\n";
}