# Dogtag WebUI — Screenshot Capture List

Capture these in the browser at the WebUI URL (e.g., `https://pki1:8443` or `http://localhost:8080`).

## Core Pages

1. **Certificates list (full view)** — `/certificates`
   - Shows all 22 certs with VALID/REVOKED status badges
   - Capture with default sort (newest first)

2. **Certificate detail — SVID cert** — click `web-server.test.example.com`
   - Expand the "Extensions" section
   - Key shot: `URIName: spiffe://test.example.com/workload/web-server` in SAN

3. **Certificate detail — Code-signing cert** — click `alice@test.example.com`
   - Expand the "Extensions" section
   - Key shot: `codeSigning - 1.3.6.1.5.5.7.3.3` in Extended Key Usage

4. **Certificate detail — Revoked cert** — click any revoked cert
   - Shows REVOKED status badge and revocation reason

## SPIRE / Sigstore Pages

5. **SPIRE SVIDs page** — `/spire`
   - Shows 4 SVID certs filtered by spiffe:// URI SAN
   - Columns: CN, SPIFFE ID, DNS SAN, Status

6. **Code Signing page** — `/code-signing`
   - Shows 3 code-signing certs filtered by EKU
   - If Rekor is configured: green verification badges on matched certs

7. **Code Signing page — Rekor badge tooltip** — hover on verification badge
   - Shows log index and UUID from Rekor transparency log

8. **Trust Chain page** — `/trust-chain`
   - Visual hierarchy: Root CA → Intermediates → Leaf certs
   - Color-coded node types

## Additional Views

9. **Login page** — `/` (if not authenticated)
   - Shows the LDAP login form

10. **Profiles page** — `/profiles` (if implemented)
    - Lists svidCert and codeSigningCert profiles

11. **Empty state** — any page with no matching certs
    - Shows the empty state message

## Browser Setup

- Use Firefox or Chrome
- Window size: 1920x1080 or 1440x900
- Light mode (PatternFly default)
- Clear any browser dev tools before capture
- Use browser screenshot tool (Ctrl+Shift+S in Firefox) for full-page captures
