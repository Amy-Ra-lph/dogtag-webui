# Security Audit — Findings

Last audited: 2026-04-21

## Architecture

The WebUI runs an **unprivileged backend** (Fastify) behind nginx. No agent or admin certificates are mounted in the container. Each user authenticates with their own credentials:

- **Password flow:** Backend authenticates to Dogtag via Basic auth, stores the resulting JSESSIONID per user
- **Certificate flow:** nginx handles mTLS (`ssl_verify_client optional_no_ca`), passes the client cert PEM to the backend via `X-SSL-Client-Cert` header, backend uses it to establish a Dogtag session

All Dogtag sessions are stored in server memory with automatic expiry (2 hours). No credentials are written to disk.

## Open Findings

### #1 — TLS Validation Disabled on CA Backend Connection (HIGH)

**Issue:** The CA proxy (`caProxy.ts`) and auth helpers (`dogtagAuth.ts`) set `rejectUnauthorized: false` on HTTPS connections to Dogtag. This allows MITM on the backend-to-CA path.

**Risk:** An attacker on the internal network could intercept/modify requests between the WebUI backend and Dogtag CA.

**Mitigation:** This is expected for PoC deployments where the CA uses a self-signed certificate. For production, set `rejectUnauthorized: true` and provide the CA chain via the `NODE_EXTRA_CA_CERTS` environment variable or a `CA_BUNDLE` path.

### #2 — Rate Limit Bypass via X-Forwarded-For Spoofing (HIGH)

**Issue:** Rate limiting uses the `X-Forwarded-For` header to identify client IPs. If a request bypasses nginx, the header can be spoofed to evade rate limits.

**Risk:** Brute-force password attacks could bypass the 5-attempt limit.

**Recommendation:** Configure nginx to strip/overwrite `X-Forwarded-For` with `proxy_set_header X-Forwarded-For $remote_addr`. The Fastify backend should only trust XFF from known proxy IPs.

### #3 — Cached Roles Not Re-Validated (HIGH)

**Issue:** User roles are cached in the session for 2 hours. If an admin revokes a user's roles in LDAP/Dogtag, the cached session continues to grant access until expiry.

**Risk:** Delayed revocation of access for up to 2 hours.

**Recommendation:** Reduce session TTL to 30 minutes for PKI systems. Periodically re-validate roles by calling Dogtag's `/ca/rest/account/login` and comparing returned roles.

### #4 — No Audit Logging for Auth Events (MEDIUM)

**Issue:** Failed login attempts are rate-limited but not logged to a persistent audit log. Successful logins are also not logged.

**Risk:** No audit trail for security investigations or compliance.

**Recommendation:** Log all auth events (success/failure) with timestamp, username, IP, and auth method to a structured log file.

### #5 — No Rate Limiting on API Endpoints (MEDIUM)

**Issue:** Only the login endpoint is rate-limited. Certificate revocation, approval, and enrollment endpoints have no rate limiting.

**Risk:** An authenticated attacker could mass-revoke certificates or spam enrollment requests.

**Recommendation:** Add per-session, per-endpoint rate limiting for write operations.

### #6 — No CA Verification at nginx Layer (MEDIUM)

**Issue:** nginx uses `ssl_verify_client optional_no_ca`, accepting any client certificate without CA verification. Certificate validation happens at Dogtag, not nginx.

**Risk:** Malformed or self-signed client certs are forwarded to the backend. Dogtag rejects them, but the backend processes the request up to that point.

**Recommendation:** For production, use `ssl_verify_client optional` with `ssl_client_certificate` pointing to the trusted CA chain. This validates certs at the nginx layer before they reach the backend.

### #7 — Missing Clear-Site-Data Header on Logout (MEDIUM)

**Issue:** Logout clears the session cookie but does not send the `Clear-Site-Data` header. Browser cache or service workers may retain stale data.

**Recommendation:** Add `Clear-Site-Data: "cache", "cookies", "storage"` header on the logout response.

### #19 — unsafe-inline in CSP for Styles (LOW — ACCEPTED RISK)

**Issue:** The Content Security Policy includes `style-src 'unsafe-inline'` because PatternFly 6 uses inline styles extensively.

**Risk:** Low. An attacker with an XSS vector could inject inline styles to restyle the UI. However, no XSS vectors exist — all dynamic content uses React's safe JSX interpolation with no `dangerouslySetInnerHTML`.

**Status:** Accepted risk. PatternFly 6 requires inline styles. Revisit if PatternFly adds CSP nonce support.

## Resolved Findings

| # | Severity | Finding | Resolution |
|---|----------|---------|------------|
| 1 | CRITICAL | Private key in git history | False positive — certs never tracked |
| 2 | CRITICAL | Hardcoded Ansible passwords | Moved to vault-encrypted group_vars |
| 3 | CRITICAL | Demo auth backend active by default | Warning logged, hints gated behind DEV mode |
| 4 | HIGH | Passwords in shell arguments | File-based passing + `no_log: true` |
| 5 | HIGH | Root user + no host key checking | Deploy user with become, setting removed |
| 6 | HIGH | HMAC timing attack | `crypto.timingSafeEqual()` |
| 7 | HIGH | TLS verify off in nginx | Documented with TODO |
| 8 | HIGH | HTTP container | TLS on port 8443 with HSTS, HTTP redirect |
| 9 | HIGH | No Secure cookie flag | Conditional Secure flag behind HTTPS |
| 10 | HIGH | Dev server on 0.0.0.0 | .env.example defaults to localhost |
| 11 | HIGH | Single admin cert for all users | **Replaced with per-user auth backend** — Fastify relays each user's own credentials to Dogtag. No agent/admin cert in container. |
| 12 | MEDIUM | No CSRF protection | SameSite=Strict cookies + Origin validation |
| 13 | MEDIUM | Temp file race condition | Ansible `tempfile` module |
| 14 | MEDIUM | No rate limiting on login | 5 attempts per IP per 15-minute window |
| 15 | MEDIUM | Login page leaks usernames | Gated behind `import.meta.env.DEV` |
| 16 | MEDIUM | Client-side RBAC only | Server-side route RBAC middleware |
| 17 | MEDIUM | 8-hour session, no idle timeout | Reduced to 2 hours |
| 18 | MEDIUM | Unencrypted LDAP | Ansible defaults to LDAPS (port 636) |
| 20 | LOW | No HSTS header | Added `Strict-Transport-Security` |
| 21 | LOW | Error messages leak internals | Filter stack traces, cap at 200 chars |
| 22 | LOW | Source maps in non-prod | Already gated by `!isProd` |
| 23 | INFO | No session invalidation | Implemented with session store + expiry sweep |
| 24 | INFO | Firewall errors suppressed | Accepted for PoC scope |
