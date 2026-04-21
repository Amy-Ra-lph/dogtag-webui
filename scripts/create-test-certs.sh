#!/bin/bash
# Create test certificates for the SPIRE/Sigstore WebUI demo
# Run on the PoC system (pki1) as root or with sudo

set -e

ADMIN_CERT=/tmp/admin-cert.pem
ADMIN_KEY=/tmp/admin-key.pem
COOKIES=/tmp/ca-cookies.txt
CA_URL=https://localhost:8443
CURL="curl -sk --cert $ADMIN_CERT --key $ADMIN_KEY -b $COOKIES"

echo "=== Establishing CA session ==="
curl -sk --cert $ADMIN_CERT --key $ADMIN_KEY -c $COOKIES \
    -H "Accept: application/json" \
    $CA_URL/ca/rest/account/login > /dev/null

WORKDIR=$(mktemp -d)
echo "Working in $WORKDIR"

enroll_cert() {
    local NAME=$1
    local SUBJECT=$2
    local PROFILE=$3
    local SAN_EXT=$4

    echo ""
    echo "=== Enrolling: $NAME ==="

    # Generate key
    openssl genrsa -out "$WORKDIR/$NAME.key" 2048 2>/dev/null

    # Create CSR with SAN extension
    if [ -n "$SAN_EXT" ]; then
        openssl req -new -key "$WORKDIR/$NAME.key" \
            -subj "$SUBJECT" \
            -addext "subjectAltName=$SAN_EXT" \
            -out "$WORKDIR/$NAME.csr" 2>/dev/null
    else
        openssl req -new -key "$WORKDIR/$NAME.key" \
            -subj "$SUBJECT" \
            -out "$WORKDIR/$NAME.csr" 2>/dev/null
    fi

    CSR=$(cat "$WORKDIR/$NAME.csr")

    # Submit enrollment request
    RESPONSE=$($CURL -H "Accept: application/json" -H "Content-Type: application/json" \
        -d "{
            \"ProfileID\": \"$PROFILE\",
            \"Renewal\": false,
            \"Input\": [{
                \"id\": \"i1\",
                \"ClassID\": \"certReqInputImpl\",
                \"Name\": \"Certificate Request Input\",
                \"Attribute\": [
                    {\"name\": \"cert_request_type\", \"Value\": \"pkcs10\"},
                    {\"name\": \"cert_request\", \"Value\": $(echo "$CSR" | python3 -c "import json,sys; print(json.dumps(sys.stdin.read()))")}
                ]
            }, {
                \"id\": \"i2\",
                \"ClassID\": \"submitterInfoInputImpl\",
                \"Name\": \"Requestor Information\",
                \"Attribute\": [
                    {\"name\": \"requestor_name\", \"Value\": \"Demo Test\"},
                    {\"name\": \"requestor_email\", \"Value\": \"demo@test.example.com\"},
                    {\"name\": \"requestor_phone\", \"Value\": \"\"}
                ]
            }]
        }" \
        $CA_URL/ca/rest/certrequests 2>&1)

    REQ_ID=$(echo "$RESPONSE" | python3 -c "
import json,sys
try:
    d=json.load(sys.stdin)
    entries=d.get('entries',[])
    if entries:
        print(entries[0].get('requestID',''))
except: pass
" 2>/dev/null)

    if [ -z "$REQ_ID" ]; then
        echo "  ERROR: Failed to submit request"
        echo "  Response: $RESPONSE" | head -5
        return 1
    fi

    echo "  Request ID: $REQ_ID"

    # Get the review form (needed for nonce)
    REVIEW=$($CURL -H "Accept: application/json" \
        $CA_URL/ca/rest/agent/certrequests/$REQ_ID 2>&1)

    NONCE=$(echo "$REVIEW" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(d.get('nonce',''))
" 2>/dev/null)

    # Approve the request
    $CURL -H "Accept: application/json" -H "Content-Type: application/json" \
        -d "$REVIEW" \
        "$CA_URL/ca/rest/agent/certrequests/$REQ_ID/approve" > /dev/null 2>&1

    # Get the cert ID
    CERT_INFO=$($CURL -H "Accept: application/json" \
        $CA_URL/ca/rest/agent/certrequests/$REQ_ID 2>&1)

    CERT_ID=$(echo "$CERT_INFO" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(d.get('certId',''))
" 2>/dev/null)

    echo "  Certificate ID: $CERT_ID"
    echo "  Status: VALID"
}

echo ""
echo "=========================================="
echo " Creating SPIRE SVID test certificates"
echo "=========================================="

# SVID 1: Web server workload
enroll_cert "svid-web-server" \
    "/CN=web-server.test.example.com" \
    "svidCert" \
    "URI:spiffe://test.example.com/workload/web-server,DNS:web-server.test.example.com"

# SVID 2: API gateway workload
enroll_cert "svid-api-gateway" \
    "/CN=api-gateway.test.example.com" \
    "svidCert" \
    "URI:spiffe://test.example.com/workload/api-gateway,DNS:api-gateway.test.example.com"

# SVID 3: MCP postgres agent
enroll_cert "svid-mcp-postgres" \
    "/CN=mcp-postgres.test.example.com" \
    "svidCert" \
    "URI:spiffe://test.example.com/workload/mcp-postgres,DNS:mcp-postgres.test.example.com"

# SVID 4: Database workload
enroll_cert "svid-database" \
    "/CN=database.test.example.com" \
    "svidCert" \
    "URI:spiffe://test.example.com/ns/production/sa/database,DNS:database.test.example.com"

echo ""
echo "=========================================="
echo " Creating code-signing test certificates"
echo "=========================================="

# Code signing 1: Developer signing cert
enroll_cert "codesign-alice" \
    "/CN=alice@test.example.com/O=Test Example" \
    "codeSigningCert" \
    "email:alice@test.example.com"

# Code signing 2: CI/CD pipeline signing
enroll_cert "codesign-ci-pipeline" \
    "/CN=ci-pipeline@test.example.com/O=Test Example" \
    "codeSigningCert" \
    "email:ci-pipeline@test.example.com"

# Code signing 3: Release manager
enroll_cert "codesign-release" \
    "/CN=release-mgr@test.example.com/O=Test Example" \
    "codeSigningCert" \
    "email:release-mgr@test.example.com"

echo ""
echo "=========================================="
echo " Summary"
echo "=========================================="
echo "Created 4 SVID certs (spiffe:// URI SANs)"
echo "Created 3 code-signing certs (file signing EKU)"
echo ""
echo "Verify with:"
echo "  pki -U $CA_URL --ignore-cert-status UNKNOWN_ISSUER,BAD_CERT_DOMAIN ca-cert-find --size 25"

# Cleanup
rm -rf "$WORKDIR"
echo ""
echo "Done."
