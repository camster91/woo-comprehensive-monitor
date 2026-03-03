@echo off
echo ============================================
echo WooCommerce Comprehensive Monitor - GitHub Push
echo ============================================
echo.

echo Step 1: Checking Git status...
git status
echo.

echo Step 2: Add remote repository (if not already added)
echo Please enter your GitHub repository URL:
echo Example: https://github.com/camster91/woo-comprehensive-monitor.git
set /p repo_url=Repository URL: 

echo.
echo Step 3: Setting up remote...
git remote add origin %repo_url%
git branch -M main

echo.
echo Step 4: Pushing to GitHub...
git push -u origin main
git push --tags

echo.
echo Step 5: Creating release instructions...
echo.
echo ✅ Code pushed to GitHub!
echo.
echo Next steps:
echo 1. Go to: https://github.com/camster91/woo-comprehensive-monitor/releases/new
echo 2. Tag version: v3.0.0
echo 3. Title: Version 3.0.0 - Complete Subscription Management
echo 4. Attach: woo-comprehensive-monitor.zip
echo 5. Publish release
echo.
echo Plugin ready for download at:
echo https://github.com/camster91/woo-comprehensive-monitor/releases
echo.
pause