#!/bin/bash
# Start server and agents together

echo "[start-all] Starting server..."
node server/index.js &
SERVER_PID=$!

# Wait for server to be ready
sleep 5

echo "[start-all] Starting demo agents..."
API_URL="http://localhost:${PORT:-3000}" node agents/gatherer.js &
API_URL="http://localhost:${PORT:-3000}" node agents/warrior.js &
API_URL="http://localhost:${PORT:-3000}" node agents/builder.js &

# Wait for server (keeps container alive)
wait $SERVER_PID
