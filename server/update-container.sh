#!/bin/bash
# Update container files with latest version

CONTAINER="as80wsgckw0wo0kk4gcggkcg-182045549329"
APP_PATH="/usr/src/app"

# Check if container exists
if ! ssh root@187.77.26.99 "docker ps -q --filter 'name=$CONTAINER'" | grep -q .; then
  echo "Container $CONTAINER not found"
  exit 1
fi

echo "Updating server.js..."
cat server.js | ssh root@187.77.26.99 "docker exec -i $CONTAINER sh -c 'cat > $APP_PATH/server.js'"

echo "Updating dashboard-enhanced.html..."
cat dashboard-enhanced.html | ssh root@187.77.26.99 "docker exec -i $CONTAINER sh -c 'cat > $APP_PATH/dashboard-enhanced.html'"

echo "Restarting Node.js process..."
ssh root@187.77.26.99 "docker exec $CONTAINER sh -c 'pkill -f node || true'"

echo "Update complete. Container should restart automatically via PM2."