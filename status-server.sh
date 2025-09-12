#!/bin/bash
echo "AFT Server Status:"

if [ -f server.pid ]; then
    PID=$(cat server.pid)
    if kill -0 $PID 2>/dev/null; then
        echo "✓ Server is running (PID: $PID)"
        echo "Server URL: http://localhost:3001"
        echo "Production URL: https://aft.foxxcyber.com"
    else
        echo "✗ Server is not running (stale PID file)"
        rm -f server.pid
    fi
else
    # Check if any bun process is running our server
    if pgrep -f "bun.*index.ts" > /dev/null; then
        echo "⚠ Server appears to be running but no PID file found"
        echo "PIDs: $(pgrep -f 'bun.*index.ts')"
    else
        echo "✗ Server is not running"
    fi
fi

# Show recent log entries if log file exists
if [ -f server.log ]; then
    echo ""
    echo "Recent log entries:"
    tail -10 server.log
fi