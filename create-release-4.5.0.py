#!/usr/bin/env python3
"""
Create release ZIP for WooCommerce Comprehensive Monitor v4.5.0
"""
import os
import zipfile
import shutil
import re
import sys

def create_release():
    # Configuration
    plugin_name = "woo-comprehensive-monitor"
    version = "4.5.0"
    output_zip = f"{plugin_name}-v{version}.zip"
    
    # Files and directories to include
    includes = [
        "woo-comprehensive-monitor.php",
        "uninstall.php",
        "README.md",
        "LICENSE",
        "index.php",  # templates/index.php
        "check-braces.php",
        "check-syntax.php",
        "test-syntax.php",
        "verify-update.php",
        "wp-cli-update.sh",
        # Directories
        "includes/",
        "admin/",
        "assets/",
        "templates/",
        "server/",  # Include server files for deployment
    ]
    
    # Files to exclude
    excludes = [
        "**/node_modules/",
        "**/.git/",
        "**/.github/",
        "**/__pycache__/",
        "**/*.py",
        "**/*.pyc",
        "**/*.log",
        "**/Thumbs.db",
        "**/.DS_Store",
        "server/node_modules/",
        "server/package-lock.json",
        "server/sites.json",  # Don't include user data
        "server/.env",  # Don't include secrets
    ]
    
    print(f"Creating {output_zip} for version {version}")
    
    # Remove old zip if exists
    if os.path.exists(output_zip):
        os.remove(output_zip)
    
    # Create zip file
    with zipfile.ZipFile(output_zip, 'w', zipfile.ZIP_DEFLATED) as zipf:
        # Add files
        for include in includes:
            if include.endswith('/'):
                # Directory
                dir_path = include.rstrip('/')
                if not os.path.exists(dir_path):
                    print(f"Warning: Directory {dir_path} does not exist")
                    continue
                    
                for root, dirs, files in os.walk(dir_path):
                    # Filter excluded patterns
                    rel_root = os.path.relpath(root, '.')
                    
                    # Skip excluded directories
                    skip = False
                    for exclude in excludes:
                        if exclude.endswith('/') and rel_root.startswith(exclude.rstrip('/')):
                            skip = True
                            break
                        if fnmatch.fnmatch(rel_root, exclude):
                            skip = True
                            break
                    if skip:
                        continue
                        
                    for file in files:
                        file_path = os.path.join(root, file)
                        rel_path = os.path.relpath(file_path, '.')
                        
                        # Check if file matches exclude pattern
                        excluded = False
                        for exclude in excludes:
                            if fnmatch.fnmatch(rel_path, exclude):
                                excluded = True
                                break
                        if excluded:
                            continue
                            
                        # Add file to zip
                        zipf.write(file_path, rel_path)
                        print(f"  + {rel_path}")
            else:
                # Single file
                if not os.path.exists(include):
                    print(f"Warning: File {include} does not exist")
                    continue
                    
                zipf.write(include, include)
                print(f"  + {include}")
    
    print(f"\n✅ Created {output_zip} ({os.path.getsize(output_zip)} bytes)")
    print(f"\nTo release:")
    print(f"  1. git tag v{version}")
    print(f"  2. git push origin v{version}")
    print(f"  3. gh release create v{version} --title 'v{version} - Comprehensive Order Flow Monitoring'")
    print(f"     --notes-file release-notes-v{version}.md {output_zip}")
    
    return output_zip

if __name__ == "__main__":
    # Add fnmatch for pattern matching
    import fnmatch
    create_release()