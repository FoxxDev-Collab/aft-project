#!/bin/bash
# Apache Setup Script for Rocky Linux 9 with CAC Authentication
# This replaces nginx with Apache for proper optional client certificate support

set -e

echo "=== Apache Setup for AFT Project with CAC Support ==="

# Stop nginx if running
echo "Stopping nginx service..."
sudo systemctl stop nginx || true
sudo systemctl disable nginx || true

# Install Apache and required modules
echo "Installing Apache and SSL modules..."
sudo dnf install -y httpd mod_ssl

# Create SSL directory
echo "Creating SSL directory..."
sudo mkdir -p /etc/httpd/ssl

# Create self-signed certificates (for testing)
echo "Creating self-signed SSL certificates..."
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /etc/httpd/ssl/aft.foxxcyber.com.key \
    -out /etc/httpd/ssl/aft.foxxcyber.com.crt \
    -subj "/C=US/ST=State/L=City/O=Organization/CN=aft.foxxcyber.com"

# Set proper permissions
sudo chmod 600 /etc/httpd/ssl/aft.foxxcyber.com.key
sudo chmod 644 /etc/httpd/ssl/aft.foxxcyber.com.crt

# Copy Apache configuration
echo "Copying Apache configuration..."
sudo cp /home/foxx/aft-project/apache-aft.conf /etc/httpd/conf.d/

# Ensure DoD certificates exist
if [ ! -f /home/foxx/aft-project/root-certs/DoD_Final_CA_Bundle.pem ]; then
    echo "DoD certificate bundle not found. Running conversion script..."
    bash /home/foxx/aft-project/convert-dod-certs.sh
fi

# Enable proxy modules (they might already be enabled)
echo "Checking Apache proxy modules..."
if [ -f /etc/httpd/conf.modules.d/00-proxy.conf ]; then
    sudo sed -i 's/^#LoadModule proxy_module/LoadModule proxy_module/' /etc/httpd/conf.modules.d/00-proxy.conf 2>/dev/null || true
    sudo sed -i 's/^#LoadModule proxy_http_module/LoadModule proxy_http_module/' /etc/httpd/conf.modules.d/00-proxy.conf 2>/dev/null || true
else
    echo "Proxy modules config not found, they may be built-in or in a different location"
fi

# SELinux settings (if SELinux is enabled)
if command -v getenforce &> /dev/null && [ "$(getenforce)" != "Disabled" ]; then
    echo "Configuring SELinux..."
    sudo setsebool -P httpd_can_network_connect on
    sudo semanage port -a -t http_port_t -p tcp 3001 2>/dev/null || true
fi

# Firewall configuration
echo "Configuring firewall..."
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --reload

# Test Apache configuration
echo "Testing Apache configuration..."
sudo apachectl configtest

# Enable and start Apache
echo "Starting Apache service..."
sudo systemctl enable httpd
sudo systemctl start httpd

# Check Apache status
echo "Checking Apache status..."
sudo systemctl status httpd --no-pager

echo ""
echo "=== Apache Setup Complete ==="
echo "Your AFT application should now be accessible at https://aft.foxxcyber.com"
echo ""
echo "Key differences from nginx:"
echo "  - Apache's 'SSLVerifyClient optional' actually requests client certificates"
echo "  - Browsers WILL be prompted to select a certificate"
echo "  - CAC authentication should work properly now"
echo ""
echo "To check logs:"
echo "  sudo tail -f /var/log/httpd/aft-access.log"
echo "  sudo tail -f /var/log/httpd/aft-error.log"
echo "  sudo tail -f /var/log/httpd/aft-ssl.log"
echo ""
echo "To restart Apache after changes:"
echo "  sudo systemctl restart httpd"