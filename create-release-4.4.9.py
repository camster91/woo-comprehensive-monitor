#!/usr/bin/env python3
"""
Create ZIP release for WooCommerce Comprehensive Monitor v4.4.9
Seamless update version with ultra-minimal activation
"""

import os
import sys
import zipfile
import glob
import fnmatch

PLUGIN_NAME = "woo-comprehensive-monitor"
VERSION = "4.4.9"
ZIP_FILE = f"{PLUGIN_NAME}-v{VERSION}.zip"

INCLUDE = [
    "*.php",
    "*.txt",
    "*.md",
    "LICENSE",
    "admin/",
    "assets/",
    "includes/",
    "languages/",
    "templates/",
    "uninstall.php",
]

EXCLUDE = [
    "*.zip",
    "*.sh",
    "*.py",
    "*.php.backup",
    "test-syntax.php",
    "check-braces.php",
    "create-zip.php",
    "create-zip.py",
    "create-release.sh",
    "create-release-tar.sh",
    "create-release-4.4.4.py",
    "create-release-4.4.5.py",
    "create-release-4.4.6.py",
    "create-release-4.4.7.py",
    "create-release-4.4.8.py",
    "create-release-4.4.9.py",
    "exclude.txt",
    "server/*",
    "server/",
    ".git/*",
    ".git/",
    ".github/*",
    ".github/",
    "node_modules/*",
    "node_modules/",
    "__pycache__/*",
    "__pycache__/",
    "*.log",
    "*.tmp",
    "*.temp",
]

def should_exclude(file_path):
    """Check if file should be excluded"""
    for pattern in EXCLUDE:
        if fnmatch.fnmatch(file_path, pattern) or fnmatch.fnmatch(os.path.basename(file_path), pattern):
            return True
        # Check directory patterns
        if pattern.endswith('/') and file_path.startswith(pattern.rstrip('/')):
            return True
    return False

def get_files_to_include():
    """Get list of files to include in ZIP"""
    files = []
    for pattern in INCLUDE:
        if pattern.endswith('/'):
            # Directory
            dir_path = pattern.rstrip('/')
            if os.path.exists(dir_path):
                for root, dirs, filenames in os.walk(dir_path):
                    for filename in filenames:
                        file_path = os.path.join(root, filename)
                        if not should_exclude(file_path):
                            files.append(file_path)
        else:
            # File pattern
            for file_path in glob.glob(pattern):
                if not should_exclude(file_path):
                    files.append(file_path)
    
    # Also include specific root files that might not be caught by patterns
    root_files = ['README.md', 'LICENSE', 'uninstall.php']
    for root_file in root_files:
        if os.path.exists(root_file) and not should_exclude(root_file):
            if root_file not in files:
                files.append(root_file)
    
    return sorted(set(files))

def create_zip():
    """Create ZIP file"""
    print(f"Creating {ZIP_FILE}...")
    
    files = get_files_to_include()
    
    with zipfile.ZipFile(ZIP_FILE, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for file_path in files:
            # Store in ZIP with forward slashes
            arcname = file_path.replace('\\', '/')
            zipf.write(file_path, arcname)
            print(f"  {arcname}")
    
    # Get ZIP size
    zip_size = os.path.getsize(ZIP_FILE)
    
    print(f"\nSuccessfully created {ZIP_FILE}")
    print(f"Size: {zip_size / 1024:.2f} KB")
    print(f"Files: {len(files)}")
    
    # Show first 20 files for verification
    print(f"\nZIP Contents (first 20 files):")
    with zipfile.ZipFile(ZIP_FILE, 'r') as zipf:
        for i, name in enumerate(zipf.namelist()[:20]):
            print(f"  {name}")
    
    print(f"\nRelease Notes for v{VERSION}:")
    print("  SEAMLESS UPDATES: Ultra-minimal activation that can't fail")
    print("  ACTIVATION FIX: No more 'Plugin could not be activated' errors")
    print("  SAFE TABLE CREATION: Moved to init_components() with try-catch")
    print("  SMART UPDATE DETECTION: Fresh install vs update handled automatically")
    print("  ALL v4.4.8 FEATURES INCLUDED:")
    print("    • Action Scheduler cleanup (2351 failed tasks)")
    print("    • Error suppression patterns")
    print("    • Smart email alerts with diagnostics")
    print("    • Stripe detection fix")
    print("    • AI Chat integration")
    print("    • Auto-updater with backups")
    
    print(f"\nTo create GitHub release:")
    print(f"1. Go to https://github.com/camster91/woo-comprehensive-monitor/releases/new")
    print(f"2. Tag: v{VERSION}")
    print(f"3. Title: v{VERSION} - Seamless Updates & Activation Fix")
    print(f"4. Description: See release notes above")
    print(f"5. Attach {ZIP_FILE}")
    print(f"6. Publish release")

if __name__ == "__main__":
    create_zip()