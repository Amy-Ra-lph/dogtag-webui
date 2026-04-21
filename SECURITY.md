# Security Audit — Findings

Last audited: 2026-04-21

## Architecture

The WebUI runs an **unprivileged backend** (Fastify) behind nginx. No agent or admin certificates are mounted in the container. Each user authenticates with their own credentials:

- **Password flow:** Backend authenticates to Dogtag via Basic auth, stores the resulting JSESSIONID per user
- **Certificate flow:** nginx handles mTLS (`ssl_verify_client optional_no_ca`), passes the client cert PEM to the backend via `X-SSL-Client-Cert` header, backend uses it to establish a Dogtag session

All Dogtag sessions are stored in server memory with automatic expiry (30 minutes) and periodic role re-validation (every 5 minutes). No credentials are written to disk.

## Open Findings

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
| 25 | HIGH | TLS validation disabled on CA connection | Configurable via `CA_TLS_REJECT_UNAUTHORIZED=true` + `CA_BUNDLE` or `NODE_EXTRA_CA_CERTS` |
| 26 | HIGH | XFF spoofing bypasses rate limiter | nginx overwrites XFF with `$remote_addr`; Fastify `trustProxy: "127.0.0.1"` |
| 27 | HIGH | Cached roles not re-validated | Session TTL reduced to 30 min; roles re-validated via Dogtag every 5 min in proxy handler |
| 28 | MEDIUM | No audit logging for auth events | Structured JSON audit log to stdout for all auth events |
| 29 | MEDIUM | No rate limiting on API endpoints | Per-session rate limit (30 writes/min) on all `/ca/rest/` write operations |
| 30 | MEDIUM | No CA verification at nginx layer | `CLIENT_CA_CERT` env var switches to `ssl_verify_client optional` with `ssl_client_certificate` |
| 31 | MEDIUM | Missing Clear-Site-Data on logout | `Clear-Site-Data: "cache", "cookies", "storage"` header added to logout response |
| 12 | MEDIUM | No CSRF protection | SameSite=Strict cookies + Origin validation |
| 13 | MEDIUM | Temp file race condition | Ansible `tempfile` module |
| 14 | MEDIUM | No rate limiting on login | 5 attempts per IP per 15-minute window |
| 15 | MEDIUM | Login page leaks usernames | Gated behind `import.meta.env.DEV` |
| 16 | MEDIUM | Client-side RBAC only | Server-side route RBAC middleware |
| 17 | MEDIUM | 8-hour session, no idle timeout | Reduced to 30 minutes with 5-minute role re-validation |
| 18 | MEDIUM | Unencrypted LDAP | Ansible defaults to LDAPS (port 636) |
| 20 | LOW | No HSTS header | Added `Strict-Transport-Security` |
| 21 | LOW | Error messages leak internals | Filter stack traces, cap at 200 chars |
| 22 | LOW | Source maps in non-prod | Already gated by `!isProd` |
| 23 | INFO | No session invalidation | Implemented with session store + expiry sweep |
| 24 | INFO | Firewall errors suppressed | Accepted for PoC scope |
