# Security Audit — Open Findings

Last audited: 2026-04-20

20 of 24 findings from the initial security audit have been resolved. The remaining four require architectural or deployment changes beyond code fixes.

## #8 — HTTP Container (HIGH)

**Issue:** The container nginx serves on plain HTTP (port 8080). Session cookies and API responses are transmitted unencrypted.

**Risk:** An attacker on the network can intercept session tokens, certificate data, and user credentials in transit.

**Recommendation:** Deploy behind a TLS-terminating ingress or load balancer. In OpenShift, an HTTPS Route handles this automatically. For standalone deployments, mount TLS certificates into the container and add `ssl_certificate` / `ssl_certificate_key` directives to the nginx config. Add `Secure` flag to all cookies once HTTPS is in place.

## #11 — Single Admin Certificate for All Users (HIGH)

**Issue:** The proxy (Vite dev server and nginx) authenticates to the Dogtag CA using a single admin client certificate. All WebUI users inherit this admin identity at the CA level regardless of their WebUI role. Server-side RBAC blocks unauthorized routes at the proxy layer, but if the proxy is bypassed, the CA sees every request as the admin.

**Risk:** A user with "auditor" role could craft direct API calls to the proxy that reach admin-level CA endpoints if the RBAC route map has gaps. If the proxy is bypassed entirely (e.g., via network access to port 8443), full CA admin access is available.

**Short-term mitigation:**
- Use a least-privilege certificate (agent-only) for the proxy instead of the admin cert.
- Firewall the CA port (8443) so only the proxy host can reach it.

**Long-term fix:**
- Configure Dogtag for LDAP password authentication so the proxy can forward per-user credentials via Basic auth headers.
- Or implement browser-level mTLS where each user presents their own client certificate, and nginx passes it through to the CA.

## #18 — Unencrypted LDAP Connection (MEDIUM)

**Issue:** The 389 Directory Server instance is configured on port 389 (plaintext LDAP). The CA-to-DS connection carries PKI data, certificates, and keys unencrypted.

**Risk:** An attacker on the same network segment can intercept LDAP traffic containing sensitive PKI data.

**Recommendation:** Configure LDAPS (port 636) in the Ansible provisioning:

1. Generate a DS server certificate during setup.
2. Update `ds-setup.inf.j2` to configure the secure port.
3. Set `pki_ds_ldaps_port = 636` and `pki_ds_secure_connection = True` in `ca.cfg.j2`.
4. Update `dogtag_ds_port` default to 636 in the role defaults.

## #19 — unsafe-inline in CSP for Styles (LOW)

**Issue:** The Content Security Policy includes `style-src 'unsafe-inline'` because PatternFly 6 uses inline styles extensively. This weakens CSP protection against CSS injection.

**Risk:** Low. An attacker who already has an XSS vector could inject inline styles to restyle the UI (e.g., overlay fake buttons, hide warnings). However, there are no XSS vectors in this codebase — all dynamic content is rendered through React's safe JSX interpolation, with no use of `dangerouslySetInnerHTML`. This is a defense-in-depth gap, not an exploitable vulnerability on its own.

**Recommendation:** Accept as known risk. PatternFly 6 requires inline styles and cannot function without `unsafe-inline`. Revisit if PatternFly adds CSP nonce support in a future release. A Vite plugin (e.g., `vite-plugin-csp`) could add nonces at build time, but adds complexity for marginal gain given the low residual risk.

## Resolved Findings Summary

| # | Severity | Finding | Resolution |
|---|----------|---------|------------|
| 1 | CRITICAL | Private key in git history | False positive — certs never tracked |
| 2 | CRITICAL | Hardcoded Ansible passwords | Moved to vault-encrypted group_vars |
| 3 | CRITICAL | Demo auth backend active by default | Warning logged, hints gated behind DEV mode |
| 4 | HIGH | Passwords in shell arguments | File-based passing + `no_log: true` |
| 5 | HIGH | Root user + no host key checking | Deploy user with become, setting removed |
| 6 | HIGH | HMAC timing attack | `crypto.timingSafeEqual()` |
| 7 | HIGH | TLS verify off in nginx | Documented with TODO |
| 9 | HIGH | No Secure cookie flag | Conditional Secure flag behind HTTPS |
| 10 | HIGH | Dev server on 0.0.0.0 | .env.example defaults to localhost |
| 12 | MEDIUM | No CSRF protection | Origin/Referer header validation |
| 13 | MEDIUM | Temp file race condition | Ansible `tempfile` module |
| 14 | MEDIUM | No rate limiting on login | 5 attempts per IP per 15-minute window |
| 15 | MEDIUM | Login page leaks usernames | Gated behind `import.meta.env.DEV` |
| 16 | MEDIUM | Client-side RBAC only | Server-side route RBAC middleware |
| 17 | MEDIUM | 8-hour session, no idle timeout | Reduced to 2 hours |
| 20 | LOW | No HSTS header | Added `Strict-Transport-Security` |
| 21 | LOW | Error messages leak internals | Filter stack traces, cap at 200 chars |
| 22 | LOW | Source maps in non-prod | Already gated by `!isProd` |
| 23 | INFO | No session invalidation | Accepted for PoC scope |
| 24 | INFO | Firewall errors suppressed | Accepted for PoC scope |
