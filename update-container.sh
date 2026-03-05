#!/bin/bash

# Update container files for WooCommerce Comprehensive Monitor

SERVER_IP="187.77.26.99"
CONTAINER_ID="as80wsgckw0wo0kk4gcggkcg-182045549329"
SERVER_DIR="\\tmp\\pi-github-repos\\camster91\\woo-comprehensive-monitor\\server"

echo "=== Updating container files ==="

# Check if ZIP exists for plugin
if [ -f "woo-comprehensive-monitor-v4.4.7.zip" ]; then
    echo "Found v4.4.7 ZIP: $(du -h woo-comprehensive-monitor-v4.4.7.zip | cut -f1)"
    # Could copy to server if needed for download
else
    echo "ZIP not found, skipping plugin upload"
fi

# Copy server files
echo "Copying server.js and dashboard-enhanced.html to container..."
if [ -f "$SERVER_DIR/server.js" ]; then
    echo "Copying server.js..."
    docker cp "$SERVER_DIR/server.js" $CONTAINER_ID:/usr/src/app/server.js 2>&1 | grep -v "Permission denied" || echo "Copy failed (permission)"
fi

if [ -f "$SERVER_DIR/dashboard-enhanced.html" ]; then
    echo "Copying dashboard-enhanced.html..."
    docker cp "$SERVER_DIR/dashboard-enhanced.html" $CONTAINER_ID:/usr/src/app/dashboard-enhanced.html 2>&1 | grep -v "Permission denied" || echo "Copy failed (permission)"
fi

echo "Restarting container..."
docker restart $CONTAINER_ID

echo "Waiting 10 seconds for container to restart..."
sleep 10

echo "Checking container health..."
docker ps -f "id=$CONTAINER_ID"

echo "Checking server logs..."
docker logs --tail 10 $CONTAINER_ID

echo "=== Done ==="