#!/bin/bash
echo "Starting AFT Server in background..."

# Kill any existing bun processes for this project
pkill -f "bun.*index.ts" 2>/dev/null || true

# Start the server in background
nohup bun index.ts > server.log 2>&1 &

# Get the PID and save it
echo $! > server.pid

echo "AFT Server started in background (PID: $!)"
echo "Check server.log for output"
echo "To stop: ./stop-server.sh"