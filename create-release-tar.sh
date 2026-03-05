#!/bin/bash
# Create release ZIP for WooCommerce Comprehensive Monitor plugin using tar
# Files are zipped directly without parent folder

PLUGIN_NAME="woo-comprehensive-monitor"
VERSION="4.4.3"
ZIP_FILE="${PLUGIN_NAME}-v${VERSION}.zip"

echo "Creating release v${VERSION}..."

# Create temporary directory for files
TEMP_DIR=$(mktemp -d)
echo "Using temp dir: $TEMP_DIR"

# Copy all plugin files to temp dir (excluding unwanted files)
echo "Copying files..."
find . -type f \( -name "*.php" -o -name "*.txt" -o -name "*.md" -o -name "LICENSE" \) \
  ! -path "./server/*" ! -path "./.git/*" ! -name "*.zip" ! -name "*.sh" ! -name "*.php.backup" \
  ! -name "test-syntax.php" ! -name "check-braces.php" ! -name "create-zip.php" ! -name "create-release.sh" \
  ! -name "create-release-tar.sh" ! -name "exclude.txt" -exec cp --parents {} "$TEMP_DIR/" \;

# Copy directories
for dir in admin assets includes languages templates; do
    if [ -d "$dir" ]; then
        echo "Copying $dir/"
        cp -r "$dir" "$TEMP_DIR/"
    fi
done

# Copy specific files
cp uninstall.php "$TEMP_DIR/" 2>/dev/null || true
cp woo-comprehensive-monitor.php "$TEMP_DIR/" 2>/dev/null || true

# Remove server directory if it was copied
rm -rf "$TEMP_DIR/server" 2>/dev/null || true

# Create ZIP using tar (supports zip format with -a option)
echo "Creating $ZIP_FILE..."
cd "$TEMP_DIR"

# Check if tar supports zip creation
if tar --help 2>&1 | grep -q "auto-compress"; then
    # Use tar's auto-compress for zip
    tar -acf "../$ZIP_FILE" ./
else
    # Create tar then compress with gzip (will be .tar.gz, not .zip)
    echo "Warning: tar doesn't support zip format, creating .tar.gz instead"
    ZIP_FILE="${PLUGIN_NAME}-v${VERSION}.tar.gz"
    tar -czf "../$ZIP_FILE" ./
fi

cd - > /dev/null

# Move ZIP to current directory
mv "$TEMP_DIR/../$ZIP_FILE" .

# Clean up
rm -rf "$TEMP_DIR"

echo "✅ Created $ZIP_FILE"
echo "📦 Size: $(du -h "$ZIP_FILE" 2>/dev/null | cut -f1 || echo 'unknown')"
echo ""
echo "📁 ZIP Contents:"
if echo "$ZIP_FILE" | grep -q "\.zip"; then
    unzip -l "$ZIP_FILE" 2>/dev/null | head -20 || echo "Cannot list contents"
else
    tar -tzf "$ZIP_FILE" 2>/dev/null | head -20 || echo "Cannot list contents"
fi
echo ""
echo "To create GitHub release:"
echo "1. Go to https://github.com/camster91/woo-comprehensive-monitor/releases/new"
echo "2. Tag: v${VERSION}"
echo "3. Title: v${VERSION} - Safe Auto-Updater & Enhanced Monitoring"
echo "4. Description:"
echo "   • Added safe auto-updater with backup & rollback"
echo "   • Added compatibility checks before updates"
echo "   • Added settings for update behavior"
echo "   • Improved Stripe gateway detection"
echo "   • Fixed plugin activation fatal errors"
echo "   • Fixed 18 audit issues from code review"
echo "5. Attach ${ZIP_FILE}"
echo "6. Publish release"