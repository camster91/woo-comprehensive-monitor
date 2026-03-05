<?php
/**
 * Create ZIP release for WooCommerce Comprehensive Monitor
 * Creates ZIP without parent folder nesting
 */

// Define plugin information
$plugin_name = 'woo-comprehensive-monitor';
$version = '4.4.3';
$zip_file = "{$plugin_name}-v{$version}.zip";

echo "Creating {$zip_file}...\n";

// Files/directories to include
$include = [
    '*.php',
    '*.txt',
    '*.md',
    'LICENSE',
    'admin/',
    'assets/',
    'includes/',
    'languages/',
    'templates/',
    'uninstall.php',
];

// Files/directories to exclude
$exclude = [
    '*.zip',
    '*.sh',
    '*.php.backup',
    'test-syntax.php',
    'check-braces.php',
    'create-zip.php',
    'create-release.sh',
    'exclude.txt',
    'server/',
    '.git/',
    '.github/',
    'wcm-backups/',
    'wcm-backups/*',
];

// Check if ZipArchive is available
if (!class_exists('ZipArchive')) {
    die("Error: ZipArchive class not found. Please enable zip extension in PHP.\n");
}

$zip = new ZipArchive();
if ($zip->open($zip_file, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== TRUE) {
    die("Error: Cannot create {$zip_file}\n");
}

// Function to add files to zip
function addToZip($zip, $source, $base_dir = '', $exclude_patterns = []) {
    if (is_file($source)) {
        // Add single file
        $relative_path = ltrim($base_dir . basename($source), '/');
        $zip->addFile($source, $relative_path);
        echo "  + {$relative_path}\n";
        return;
    }
    
    if (!is_dir($source)) {
        return;
    }
    
    $files = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($source, RecursiveDirectoryIterator::SKIP_DOTS),
        RecursiveIteratorIterator::SELF_FIRST
    );
    
    foreach ($files as $file) {
        $file_path = $file->getRealPath();
        $relative_path = ltrim($base_dir . substr($file_path, strlen($source) + 1), '/');
        
        // Check if file should be excluded
        $excluded = false;
        foreach ($exclude_patterns as $pattern) {
            if (fnmatch($pattern, $relative_path) || fnmatch($pattern, basename($file_path))) {
                $excluded = true;
                break;
            }
        }
        
        if ($excluded) {
            continue;
        }
        
        if ($file->isDir()) {
            // Add empty directory
            $zip->addEmptyDir($relative_path . '/');
        } else {
            // Add file
            $zip->addFile($file_path, $relative_path);
            echo "  + {$relative_path}\n";
        }
    }
}

// Process includes
foreach ($include as $item) {
    if (strpos($item, '*') !== false) {
        // Handle wildcards
        $files = glob($item);
        foreach ($files as $file) {
            // Check if file should be excluded
            $excluded = false;
            foreach ($exclude as $pattern) {
                if (fnmatch($pattern, basename($file))) {
                    $excluded = true;
                    break;
                }
            }
            
            if (!$excluded && is_file($file)) {
                $zip->addFile($file, basename($file));
                echo "  + " . basename($file) . "\n";
            }
        }
    } elseif (is_dir($item)) {
        addToZip($zip, $item, '', $exclude);
    } elseif (is_file($item)) {
        // Check if file should be excluded
        $excluded = false;
        foreach ($exclude as $pattern) {
            if (fnmatch($pattern, basename($item))) {
                $excluded = true;
                break;
            }
        }
        
        if (!$excluded) {
            $zip->addFile($item, basename($item));
            echo "  + " . basename($item) . "\n";
        }
    }
}

$zip->close();

// Verify ZIP was created
if (!file_exists($zip_file)) {
    die("Error: Failed to create {$zip_file}\n");
}

$size = filesize($zip_file);
$size_mb = round($size / 1024 / 1024, 2);

echo "\n✅ Successfully created {$zip_file}\n";
echo "📦 Size: {$size_mb} MB\n\n";

// List first 20 files in ZIP
echo "📁 ZIP Contents (first 20 files):\n";
$zip = new ZipArchive();
if ($zip->open($zip_file) === TRUE) {
    $count = min(20, $zip->numFiles);
    for ($i = 0; $i < $count; $i++) {
        echo "  " . $zip->getNameIndex($i) . "\n";
    }
    $zip->close();
}

echo "\n📋 Release Notes for v{$version}:\n";
echo "   • Added safe auto-updater with backup & rollback\n";
echo "   • Added compatibility checks before updates\n";
echo "   • Added settings for update behavior\n";
echo "   • Improved Stripe gateway detection\n";
echo "   • Fixed plugin activation fatal errors\n";
echo "   • Fixed 18 audit issues from code review\n\n";

echo "To create GitHub release:\n";
echo "1. Go to https://github.com/camster91/woo-comprehensive-monitor/releases/new\n";
echo "2. Tag: v{$version}\n";
echo "3. Title: v{$version} - Safe Auto-Updater & Enhanced Monitoring\n";
echo "4. Description: See release notes above\n";
echo "5. Attach {$zip_file}\n";
echo "6. Publish release\n";