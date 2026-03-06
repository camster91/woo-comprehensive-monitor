#!/bin/bash
# Create release ZIP for WooCommerce Comprehensive Monitor plugin
# Files are zipped directly without parent folder

PLUGIN_NAME="woo-comprehensive-monitor"
VERSION="4.5.2"
ZIP_FILE="${PLUGIN_NAME}-v${VERSION}.zip"

echo "Creating release v${VERSION}..."

# Create list of files to include
FILES_TO_INCLUDE=(
  "*.php"
  "*.txt"
  "*.md"
  "LICENSE"
  "admin/"
  "assets/"
  "includes/"
  "languages/"
  "templates/"
  "uninstall.php"
)

# Create list of files to exclude
EXCLUDE_LIST=(
  "*.zip"
  "*.sh"
  "*.php.backup"
  "test-syntax.php"
  "check-braces.php"
  "exclude.txt"
  "server/"
  ".git/"
)

# Build exclude arguments for zip
EXCLUDE_ARGS=()
for exclude in "${EXCLUDE_LIST[@]}"; do
  EXCLUDE_ARGS+=("-x" "$exclude")
done

# Create the ZIP file directly from current directory
echo "Creating ${ZIP_FILE}..."
if command -v 7z &> /dev/null; then
  7z a -tzip "${ZIP_FILE}" "${FILES_TO_INCLUDE[@]}" "${EXCLUDE_ARGS[@]}" > /dev/null
elif command -v zip &> /dev/null; then
  # Using zip command (Windows git bash compatible)
  zip -r "${ZIP_FILE}" "${FILES_TO_INCLUDE[@]}" -x "${EXCLUDE_LIST[@]}" > /dev/null
else
  echo "Error: Neither zip nor 7z command found"
  exit 1
fi

echo "✅ Created ${ZIP_FILE}"
echo "📦 Size: $(du -h ${ZIP_FILE} 2>/dev/null || echo 'unknown')"
echo ""
echo "📁 ZIP Contents (first 10 files):"
if command -v unzip &> /dev/null; then
  unzip -l "${ZIP_FILE}" | head -20
fi
echo ""
echo "To create GitHub release:"
echo "1. Go to https://github.com/camster91/woo-comprehensive-monitor/releases/new"
echo "2. Tag: v${VERSION}"
echo "3. Title: v${VERSION} - Ultra-minimal activation fix + DeepSeek AI chat"
echo "4. Description:"
echo "   - Ultra-minimal activation fix (no more fatal errors on activation)"
echo "   - DeepSeek AI chat integration in monitoring dashboard"
echo "   - Action Scheduler 2351 failed tasks cleanup"
echo "   - Enhanced error tracking with diagnostic suggestions"
echo "   - WordPress file access for AI analysis (preliminary)"
echo "5. Attach ${ZIP_FILE}"
echo "6. Publish release"