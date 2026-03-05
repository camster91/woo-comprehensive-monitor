#!/usr/bin/env python3
"""
Create ZIP release for WooCommerce Comprehensive Monitor
Creates ZIP without parent folder nesting
"""

import os
import sys
import zipfile
import glob
import fnmatch
from pathlib import Path

# Plugin information
PLUGIN_NAME = "woo-comprehensive-monitor"
VERSION = "4.4.3"
ZIP_FILE = f"{PLUGIN_NAME}-v{VERSION}.zip"

# Files/directories to include
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

# Files/directories to exclude (patterns)
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
    "exclude.txt",
    "server/*",
    "server/",
    ".git/*",
    ".git/",
    ".github/*",
    ".github/",
    "wcm-backups/*",
    "wcm-backups/",
]

def should_exclude(path):
    """Check if path should be excluded"""
    rel_path = os.path.relpath(path, ".")
    for pattern in EXCLUDE:
        if fnmatch.fnmatch(rel_path, pattern) or fnmatch.fnmatch(os.path.basename(path), pattern):
            return True
    return False

def main():
    print(f"Creating {ZIP_FILE}...")
    
    # Get list of files to include
    files_to_zip = []
    
    for pattern in INCLUDE:
        if "*" in pattern:
            # Handle wildcards
            matches = glob.glob(pattern, recursive=False)
            for match in matches:
                if os.path.isfile(match) and not should_exclude(match):
                    files_to_zip.append(match)
        elif pattern.endswith("/"):
            # Handle directories
            dir_path = pattern.rstrip("/")
            if os.path.isdir(dir_path):
                for root, dirs, files in os.walk(dir_path):
                    # Skip excluded directories
                    dirs[:] = [d for d in dirs if not should_exclude(os.path.join(root, d))]
                    
                    for file in files:
                        file_path = os.path.join(root, file)
                        if not should_exclude(file_path):
                            files_to_zip.append(file_path)
        else:
            # Handle specific files
            if os.path.isfile(pattern) and not should_exclude(pattern):
                files_to_zip.append(pattern)
    
    # Also include main plugin file if not already included
    main_plugin = "woo-comprehensive-monitor.php"
    if os.path.isfile(main_plugin) and main_plugin not in files_to_zip:
        files_to_zip.append(main_plugin)
    
    # Remove duplicates
    files_to_zip = list(set(files_to_zip))
    
    # Create ZIP file
    try:
        with zipfile.ZipFile(ZIP_FILE, "w", zipfile.ZIP_DEFLATED) as zf:
            for file_path in sorted(files_to_zip):
                # Calculate relative path for ZIP
                arcname = os.path.basename(file_path) if os.path.dirname(file_path) == "" else file_path
                
                # Don't include directory prefix
                if arcname.startswith("./"):
                    arcname = arcname[2:]
                
                print(f"  + {arcname}")
                zf.write(file_path, arcname)
    except Exception as e:
        print(f"Error creating ZIP: {e}")
        sys.exit(1)
    
    # Verify ZIP was created
    if not os.path.exists(ZIP_FILE):
        print("Error: Failed to create ZIP file")
        sys.exit(1)
    
    # Get file size
    size = os.path.getsize(ZIP_FILE)
    size_mb = size / 1024 / 1024
    
    print(f"\n✅ Successfully created {ZIP_FILE}")
    print(f"📦 Size: {size_mb:.2f} MB")
    print(f"📁 Files: {len(files_to_zip)}")
    
    # List first 20 files in ZIP
    print("\n📁 ZIP Contents (first 20 files):")
    try:
        with zipfile.ZipFile(ZIP_FILE, "r") as zf:
            for i, name in enumerate(zf.namelist()[:20]):
                print(f"  {name}")
    except:
        print("  (Cannot list contents)")
    
    print("\n📋 Release Notes for v{VERSION}:")
    print("   • Added safe auto-updater with backup & rollback")
    print("   • Added compatibility checks before updates")
    print("   • Added settings for update behavior")
    print("   • Improved Stripe gateway detection")
    print("   • Fixed plugin activation fatal errors")
    print("   • Fixed 18 audit issues from code review")
    print()
    
    print("To create GitHub release:")
    print(f"1. Go to https://github.com/camster91/woo-comprehensive-monitor/releases/new")
    print(f"2. Tag: v{VERSION}")
    print(f"3. Title: v{VERSION} - Safe Auto-Updater & Enhanced Monitoring")
    print(f"4. Description: See release notes above")
    print(f"5. Attach {ZIP_FILE}")
    print(f"6. Publish release")

if __name__ == "__main__":
    main()