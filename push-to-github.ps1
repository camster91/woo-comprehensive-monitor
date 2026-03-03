Write-Host "============================================" -ForegroundColor Cyan
Write-Host "WooCommerce Comprehensive Monitor - GitHub Push" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Step 1: Checking Git status..." -ForegroundColor Yellow
git status
Write-Host ""

Write-Host "Step 2: Add remote repository" -ForegroundColor Yellow
$repo_url = Read-Host "Enter GitHub repository URL (e.g., https://github.com/camster91/woo-comprehensive-monitor.git)"

Write-Host ""
Write-Host "Step 3: Setting up remote..." -ForegroundColor Yellow
git remote add origin $repo_url
git branch -M main

Write-Host ""
Write-Host "Step 4: Pushing to GitHub..." -ForegroundColor Yellow
git push -u origin main
git push --tags

Write-Host ""
Write-Host "✅ Code pushed to GitHub!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Go to: https://github.com/camster91/woo-comprehensive-monitor/releases/new" -ForegroundColor White
Write-Host "2. Tag version: v3.0.0" -ForegroundColor White
Write-Host "3. Title: Version 3.0.0 - Complete Subscription Management" -ForegroundColor White
Write-Host "4. Attach: woo-comprehensive-monitor.zip" -ForegroundColor White
Write-Host "5. Publish release" -ForegroundColor White
Write-Host ""
Write-Host "Plugin ready for download at:" -ForegroundColor Cyan
Write-Host "https://github.com/camster91/woo-comprehensive-monitor/releases" -ForegroundColor White
Write-Host ""
Write-Host "Press any key to continue..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")