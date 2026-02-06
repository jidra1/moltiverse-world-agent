#!/bin/sh
# Start server and agents together

PORT=${PORT:-3000}
echo "[start-all] PORT=$PORT"

echo "[start-all] Starting server..."
node server/index.js &
SERVER_PID=$!

# Wait for server to be ready
sleep 8

echo "[start-all] Starting demo agents on http://localhost:$PORT ..."
API_URL="http://localhost:$PORT" node agents/gatherer.js &
API_URL="http://localhost:$PORT" node agents/warrior.js &
API_URL="http://localhost:$PORT" node agents/builder.js &

echo "[start-all] All processes started"

# Wait for server (keeps container alive)
wait $SERVER_PID
