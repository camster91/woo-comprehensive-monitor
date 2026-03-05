<![CDATA[# PowerShell script to create GitHub release for WooCommerce Comprehensive Monitor v4.4.5
# Requires GitHub CLI (gh) installed and authenticated

param(
    [string]$Version,
    [string]$Tag,
    [string]$ZipFile
)

# Set defaults if not provided
if (-not $Version) { $Version = "4.4.6" }
if (-not $Tag) { $Tag = "v4.4.6" }
if (-not $ZipFile) { $ZipFile = "woo-comprehensive-monitor-v4.4.6.zip" }

$ErrorActionPreference = "Stop"

Write-Host "🚀 Creating GitHub Release for WooCommerce Comprehensive Monitor v$Version" -ForegroundColor Cyan
Write-Host "==========================================================================" -ForegroundColor Cyan

# Check if GitHub CLI is installed
try {
    $ghVersion = gh --version
    Write-Host "✅ GitHub CLI installed: $($ghVersion | Select-String 'gh version')" -ForegroundColor Green
} catch {
    Write-Host "❌ GitHub CLI not installed." -ForegroundColor Red
    Write-Host "   Download from: https://cli.github.com/" -ForegroundColor Yellow
    Write-Host "   Or create release manually at:" -ForegroundColor Yellow
    Write-Host "   https://github.com/camster91/woo-comprehensive-monitor/releases/new" -ForegroundColor Yellow
    exit 1
}

# Check if authenticated
try {
    $authStatus = gh auth status 2>&1
    if ($authStatus -match "Logged in to github.com") {
        Write-Host "✅ GitHub CLI authenticated" -ForegroundColor Green
    } else {
        Write-Host "❌ GitHub CLI not authenticated. Run: gh auth login" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ GitHub CLI auth check failed" -ForegroundColor Red
    exit 1
}

# Check if ZIP file exists
if (-not (Test-Path $ZipFile)) {
    Write-Host "❌ ZIP file not found: $ZipFile" -ForegroundColor Red
    Write-Host "   Run: python create-release-4.4.5.py" -ForegroundColor Yellow
    exit 1
}

$ZipSize = (Get-Item $ZipFile).Length / 1MB
Write-Host "✅ ZIP file found: $ZipFile ($([math]::Round($ZipSize, 2)) MB)" -ForegroundColor Green

# Create release notes file
$ReleaseNotes = @"
## v$Version - Auto-Update Defaults & Admin Notice Logging

### ✨ New Features
- Auto-updates enabled by default (checks GitHub releases)
- Backup creation enabled by default before updates
- Compatibility checks before updates
- Major updates set to auto (configurable)

### 🔧 Fixes & Improvements
- Default alert email set to cameron@ashbi.ca
- Admin notices logged to monitoring server
- Stripe warnings sent to dashboard for debugging
- Enhanced dashboard with admin notices
- Fixed HTML structure issues
- Safe auto-updater with backup & rollback
- Improved Stripe gateway detection

### 🐛 Critical Fixes
- Fatal activation error (ON UPDATE CURRENT_TIMESTAMP)
- Alert email now uses cameron@ashbi.ca by default
- Auto-update settings properly initialized

### 📦 Installation
1. Download this ZIP file
2. WordPress Admin → Plugins → Add New → Upload Plugin
3. Install and activate
4. Plugin auto-connects to monitoring server: https://woo.ashbi.ca

### 🔗 Links
- **Dashboard**: https://woo.ashbi.ca/dashboard
- **Documentation**: https://github.com/camster91/woo-comprehensive-monitor
- **Live Store**: https://4evrstrong.com (currently v4.4.1, will auto-update)
"@

$NotesFile = "release-notes-v$Version.md"
$ReleaseNotes | Out-File -FilePath $NotesFile -Encoding UTF8
Write-Host "✅ Created release notes: $NotesFile" -ForegroundColor Green

# Create release
Write-Host "📤 Creating GitHub release..." -ForegroundColor Cyan
try {
    $ReleaseCmd = "gh release create $Tag " +
                  "--title 'v$Version - Auto-Update Defaults & Admin Notice Logging' " +
                  "--notes-file '$NotesFile' " +
                  "'$ZipFile'"
    
    Write-Host "Command: $ReleaseCmd" -ForegroundColor Gray
    
    # Execute the command
    Invoke-Expression $ReleaseCmd
    
    Write-Host "✅ GitHub release created successfully!" -ForegroundColor Green
    Write-Host "   URL: https://github.com/camster91/woo-comprehensive-monitor/releases/tag/$Tag" -ForegroundColor Cyan
    
} catch {
    Write-Host "❌ Failed to create release: $_" -ForegroundColor Red
    Write-Host "   Manual release URL: https://github.com/camster91/woo-comprehensive-monitor/releases/new" -ForegroundColor Yellow
}

# Clean up
if (Test-Path $NotesFile) {
    Remove-Item $NotesFile
    Write-Host "✅ Cleaned up temporary files" -ForegroundColor Green
}

Write-Host ""
Write-Host "📋 Next Steps:" -ForegroundColor Cyan
Write-Host "1. Store will auto-update within 12 hours" -ForegroundColor White
Write-Host "2. Monitor dashboard: https://woo.ashbi.ca/dashboard" -ForegroundColor White
Write-Host "3. Check admin notices for Stripe warnings" -ForegroundColor White
Write-Host "4. Test error tracking on store frontend" -ForegroundColor White
Write-Host ""
Write-Host "🎉 Deployment complete!" -ForegroundColor Green]]>