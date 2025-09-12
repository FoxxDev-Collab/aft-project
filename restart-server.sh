#!/bin/bash
echo "Restarting AFT Server..."

# Stop the server
./stop-server.sh

# Wait a moment
sleep 2

# Start the server again
./start-server.sh

echo "AFT Server restarted"