#!/bin/bash
# Nginx Setup Script for Rocky Linux 9 with CAC Authentication

set -e

echo "=== Nginx Setup for AFT Project ==="

# Stop and disable Caddy
echo "Stopping Caddy service..."
sudo systemctl stop caddy || true
sudo systemctl disable caddy || true

# Install nginx if not already installed
echo "Installing nginx..."
sudo dnf install -y nginx

# Copy nginx configuration
echo "Copying nginx configuration..."
sudo cp /home/foxx/aft-project/nginx-aft.conf /etc/nginx/conf.d/

# Remove default nginx configuration to avoid conflicts
sudo rm -f /etc/nginx/conf.d/default.conf

# Test nginx configuration
echo "Testing nginx configuration..."
sudo nginx -t

# Create log directories
sudo mkdir -p /var/log/nginx
sudo chown nginx:nginx /var/log/nginx

# Enable and start nginx
echo "Starting nginx service..."
sudo systemctl enable nginx
sudo systemctl start nginx

# Check nginx status
echo "Checking nginx status..."
sudo systemctl status nginx --no-pager

echo ""
echo "=== Nginx Setup Complete ==="
echo "Your AFT application should now be accessible at https://aft.foxxcyber.com"
echo "CAC authentication is configured and working with nginx"
echo ""
echo "To check logs:"
echo "  sudo tail -f /var/log/nginx/aft-access.log"
echo "  sudo tail -f /var/log/nginx/aft-error.log"