#!/bin/bash
set -euo pipefail

# Creates a least-privilege agent certificate for the WebUI proxy.
# Called by Ansible with environment variables set.

PKI_DIR="/root/.dogtag/${PKI_INSTANCE}"
PKI_ALIAS="${PKI_DIR}/ca/alias"
PKI_PASSCONF="${PKI_DIR}/ca/password.conf"
PKI_ADMIN_NICK="PKI Administrator for ${PKI_SECURITY_DOMAIN}"
PKI_URL="https://localhost:${PKI_HTTPS_PORT}/ca"

TMPNSS=$(mktemp -d)
trap 'rm -rf "$TMPNSS"' EXIT

# Create a temporary NSS database for the agent key
certutil -N -d "$TMPNSS" --empty-password

# Generate a CSR for the agent
certutil -R -d "$TMPNSS" \
    -s "CN=WebUI Agent,OU=${PKI_INSTANCE}" \
    -o "$TMPNSS/agent.csr" -a

# Submit the CSR using the admin cert
REQUEST_ID=$(pki -d "$PKI_ALIAS" -C "$PKI_PASSCONF" \
    -n "$PKI_ADMIN_NICK" -U "$PKI_URL" \
    ca-cert-request-submit --profile caAgentCert \
    --csr-file "$TMPNSS/agent.csr" \
    | grep "Request ID:" | awk '{print $3}')

# Approve the request
pki -d "$PKI_ALIAS" -C "$PKI_PASSCONF" \
    -n "$PKI_ADMIN_NICK" -U "$PKI_URL" \
    ca-cert-request-approve "$REQUEST_ID" --force

# Get the certificate ID
CERT_ID=$(pki -d "$PKI_ALIAS" -C "$PKI_PASSCONF" \
    -n "$PKI_ADMIN_NICK" -U "$PKI_URL" \
    ca-cert-request-show "$REQUEST_ID" \
    | grep "Certificate ID:" | awk '{print $3}')

# Export the certificate
mkdir -p "$(dirname "$AGENT_CERT_PEM")"
pki -d "$PKI_ALIAS" -C "$PKI_PASSCONF" \
    -n "$PKI_ADMIN_NICK" -U "$PKI_URL" \
    ca-cert-export "$CERT_ID" --output-file "$AGENT_CERT_PEM"

# Export the private key via PKCS12
pk12util -o "$TMPNSS/agent.p12" -d "$TMPNSS" \
    -n "CN=WebUI Agent,OU=${PKI_INSTANCE}" -W ""
openssl pkcs12 -in "$TMPNSS/agent.p12" \
    -nocerts -nodes -out "$AGENT_KEY_PEM" -passin pass:

chmod 600 "$AGENT_CERT_PEM" "$AGENT_KEY_PEM"
