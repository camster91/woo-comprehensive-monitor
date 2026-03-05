#!/usr/bin/env python3
"""
Create ZIP release for WooCommerce Comprehensive Monitor v4.4.8
"""

import os
import sys
import zipfile
import glob
import fnmatch

PLUGIN_NAME = "woo-comprehensive-monitor"
VERSION = "4.4.8"
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
    rel_path = os.path.relpath(path, ".")
    for pattern in EXCLUDE:
        if fnmatch.fnmatch(rel_path, pattern) or fnmatch.fnmatch(os.path.basename(path), pattern):
            return True
    return False

def main():
    print(f"Creating {ZIP_FILE}...")
    
    files_to_zip = []
    
    for pattern in INCLUDE:
        if "*" in pattern:
            matches = glob.glob(pattern, recursive=False)
            for match in matches:
                if os.path.isfile(match) and not should_exclude(match):
                    files_to_zip.append(match)
        elif pattern.endswith("/"):
            dir_path = pattern.rstrip("/")
            if os.path.isdir(dir_path):
                for root, dirs, files in os.walk(dir_path):
                    dirs[:] = [d for d in dirs if not should_exclude(os.path.join(root, d))]
                    for file in files:
                        file_path = os.path.join(root, file)
                        if not should_exclude(file_path):
                            files_to_zip.append(file_path)
        else:
            if os.path.isfile(pattern) and not should_exclude(pattern):
                files_to_zip.append(pattern)
    
    # Include main plugin file if not already included
    main_plugin = "woo-comprehensive-monitor.php"
    if os.path.isfile(main_plugin) and main_plugin not in files_to_zip:
        files_to_zip.append(main_plugin)
    
    files_to_zip = list(set(files_to_zip))
    
    try:
        with zipfile.ZipFile(ZIP_FILE, "w", zipfile.ZIP_DEFLATED) as zf:
            for file_path in sorted(files_to_zip):
                arcname = os.path.basename(file_path) if os.path.dirname(file_path) == "" else file_path
                if arcname.startswith("./"):
                    arcname = arcname[2:]
                print(f"  {arcname}")
                zf.write(file_path, arcname)
    except Exception as e:
        print(f"Error creating ZIP: {e}")
        sys.exit(1)
    
    if not os.path.exists(ZIP_FILE):
        print("Error: Failed to create ZIP file")
        sys.exit(1)
    
    size = os.path.getsize(ZIP_FILE)
    size_mb = size / 1024 / 1024
    
    print(f"\nSuccessfully created {ZIP_FILE}")
    print(f"Size: {size_mb:.2f} MB")
    print(f"Files: {len(files_to_zip)}")
    
    print("\nZIP Contents (first 20 files):")
    try:
        with zipfile.ZipFile(ZIP_FILE, "r") as zf:
            for i, name in enumerate(zf.namelist()[:20]):
                print(f"  {name}")
    except:
        print("  (Cannot list contents)")
    
    print(f"\nRelease Notes for v{VERSION}:")
    print("  • FIXED: Stripe detection in health checks (now matches main plugin logic)")
    print("  • ADDED: Action Scheduler cleanup feature for failed WP-Cron tasks")
    print("  • ADDED: WP-Cron fix tool (reschedules missing events)")
    print("  • ADDED: Health page now shows actionable fixes with one-click buttons")
    print("  • ADDED: Automatically clean failed Action Scheduler tasks >7 days old")
    print("  • ADDED: Automatically clean completed tasks >30 days old")
    print("  • FIXED: Activation error handling improvements from v4.4.7")
    print("  • AUTO-UPDATES: Enabled by default with backup & compatibility checks")
    print("  • ALERT EMAIL: Default set to cameron@ashbi.ca")
    print("  • ADMIN NOTICES: Logged to monitoring server for dashboard viewing")
    print()
    
    print("To create GitHub release:")
    print(f"1. Go to https://github.com/camster91/woo-comprehensive-monitor/releases/new")
    print(f"2. Tag: v{VERSION}")
    print(f"3. Title: v{VERSION} - Action Scheduler Cleanup & Stripe Detection Fix")
    print(f"4. Description: See release notes above")
    print(f"5. Attach {ZIP_FILE}")
    print(f"6. Publish release")

if __name__ == "__main__":
    main()