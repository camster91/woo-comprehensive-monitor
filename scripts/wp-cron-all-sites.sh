#!/bin/bash
# System cron runner for all WordPress sites
# Add to crontab: */15 * * * * /home/u633679196/wp-cron-all-sites.sh >> /home/u633679196/wp-cron.log 2>&1
#
# Runs wp-cron.php for each site every 15 minutes via curl.
# This replaces WordPress's built-in cron (which piggybacks on page loads)
# with a proper system-level trigger.

WP_BASE="/home/u633679196/domains"

for dir in $WP_BASE/*/public_html/wp-config.php; do
    site=$(echo "$dir" | sed "s|$WP_BASE/||;s|/public_html/wp-config.php||")
    # Fire wp-cron.php in the background, 10s timeout, don't wait
    curl -s --max-time 10 "https://$site/wp-cron.php" > /dev/null 2>&1 &
done

# Wait for all background curls to finish (max 15s)
wait
