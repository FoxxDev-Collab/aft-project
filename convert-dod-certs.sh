#!/bin/bash
# DoD Certificate Conversion Script for Rocky Linux 9
# Converts PKCS#7 certificates to PEM format for Caddy

set -e

echo "=== DoD Certificate Conversion Script ==="
echo "Converting PKCS#7 certificates to PEM format for Caddy..."

# Navigate to root-certs directory
cd /home/foxx/aft-project/root-certs

# Check if OpenSSL is available
if ! command -v openssl &> /dev/null; then
    echo "Error: OpenSSL is not installed. Installing..."
    sudo dnf install -y openssl
fi

echo "Converting main DoD certificate bundle (DER format)..."
openssl pkcs7 -inform DER -in Certificates_PKCS7_v5_14_DoD.der.p7b -print_certs -out DoD_CA_Bundle_DER.pem

echo "Converting main DoD certificate bundle (PEM format)..."
openssl pkcs7 -inform PEM -in Certificates_PKCS7_v5_14_DoD.pem.p7b -print_certs -out DoD_CA_Bundle_PEM.pem

echo "Converting individual root CA certificates..."
openssl pkcs7 -inform DER -in Certificates_PKCS7_v5_14_DoD_DoD_Root_CA_3.der.p7b -print_certs -out DoD_Root_CA_3.pem
openssl pkcs7 -inform DER -in Certificates_PKCS7_v5_14_DoD_DoD_Root_CA_4.der.p7b -print_certs -out DoD_Root_CA_4.pem
openssl pkcs7 -inform DER -in Certificates_PKCS7_v5_14_DoD_DoD_Root_CA_5.der.p7b -print_certs -out DoD_Root_CA_5.pem
openssl pkcs7 -inform DER -in Certificates_PKCS7_v5_14_DoD_DoD_Root_CA_6.der.p7b -print_certs -out DoD_Root_CA_6.pem

echo "Creating comprehensive DoD CA bundle for Caddy..."
cat DoD_CA_Bundle_DER.pem DoD_CA_Bundle_PEM.pem DoD_Root_CA_3.pem DoD_Root_CA_4.pem DoD_Root_CA_5.pem DoD_Root_CA_6.pem > DoD_Complete_CA_Bundle.pem

# Remove any duplicate certificates and empty lines
echo "Cleaning up certificate bundle..."
awk '/-----BEGIN CERTIFICATE-----/{cert=""} {cert=cert$0"\n"} /-----END CERTIFICATE-----/{if(!seen[cert]) {print cert; seen[cert]=1}}' DoD_Complete_CA_Bundle.pem > DoD_Final_CA_Bundle.pem

echo "Setting proper permissions..."
chmod 644 *.pem
chown foxx:foxx *.pem

echo "=== Conversion Complete ==="
echo "Certificate files created:"
echo "  - DoD_Final_CA_Bundle.pem (recommended for Caddy)"
echo "  - DoD_Complete_CA_Bundle.pem (all certificates combined)"
echo "  - Individual root CA files: DoD_Root_CA_*.pem"

echo ""
echo "To use with Caddy, update your Caddyfile to use:"
echo "  pem_file /home/foxx/aft-project/root-certs/DoD_Final_CA_Bundle.pem"

echo ""
echo "Certificate count in final bundle:"
grep -c "BEGIN CERTIFICATE" DoD_Final_CA_Bundle.pem

echo ""
echo "=== Script completed successfully ==="