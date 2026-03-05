#!/bin/bash

# Deploy server updates to Coolify container

SERVER_IP="187.77.26.99"
CONTAINER_NAME="as80wsgckw0wo0kk4gcggkcg-182045549329"
LOCAL_SERVER_DIR="server"
TEMP_DIR="/tmp/server-update-$(date +%Y%m%d%H%M%S)"

echo "=== Deploying server updates to $SERVER_IP ==="

# Create temp directory on server
echo "Creating temp directory on server..."
ssh root@$SERVER_IP "mkdir -p $TEMP_DIR"

# Upload server.js
if [ -f "$LOCAL_SERVER_DIR/server.js" ]; then
    echo "Uploading server.js..."
    scp "$LOCAL_SERVER_DIR/server.js" "root@${SERVER_IP}:${TEMP_DIR}/server.js"
    echo "✓ server.js uploaded"
else
    echo "✗ server.js not found locally"
    exit 1
fi

# Upload dashboard-enhanced.html
if [ -f "$LOCAL_SERVER_DIR/dashboard-enhanced.html" ]; then
    echo "Uploading dashboard-enhanced.html..."
    scp "$LOCAL_SERVER_DIR/dashboard-enhanced.html" "root@${SERVER_IP}:${TEMP_DIR}/dashboard-enhanced.html"
    echo "✓ dashboard-enhanced.html uploaded"
else
    echo "✗ dashboard-enhanced.html not found locally"
    exit 1
fi

# Copy files into container
echo "Copying files into container $CONTAINER_NAME..."
ssh root@$SERVER_IP "docker cp $TEMP_DIR/server.js $CONTAINER_NAME:/usr/src/app/server.js"
ssh root@$SERVER_IP "docker cp $TEMP_DIR/dashboard-enhanced.html $CONTAINER_NAME:/usr/src/app/dashboard-enhanced.html"

# Restart container
echo "Restarting container..."
ssh root@$SERVER_IP "docker restart $CONTAINER_NAME"

# Wait for restart
echo "Waiting 10 seconds for container to restart..."
sleep 10

# Check container status
echo "Checking container status..."
ssh root@$SERVER_IP "docker ps -f name=$CONTAINER_NAME"

# Clean up temp directory
echo "Cleaning up temp directory..."
ssh root@$SERVER_IP "rm -rf $TEMP_DIR"

echo "=== Deployment complete ==="
echo "Check server health: https://woo.ashbi.ca/api/health"
echo "Check dashboard: https://woo.ashbi.ca/dashboard"