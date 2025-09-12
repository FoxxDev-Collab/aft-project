#!/bin/bash
echo "Stopping AFT Server..."

# Kill using PID file if it exists
if [ -f server.pid ]; then
    PID=$(cat server.pid)
    if kill -0 $PID 2>/dev/null; then
        kill $PID
        echo "AFT Server stopped (PID: $PID)"
    else
        echo "Server process not running"
    fi
    rm -f server.pid
else
    # Fallback: kill by process name
    pkill -f "bun.*index.ts" 2>/dev/null || true
    echo "AFT Server stopped"
fi