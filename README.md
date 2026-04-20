# Dogtag PKI WebUI

A modern web interface for [Dogtag PKI](https://www.dogtagpki.org/) (upstream of Red Hat Certificate System), built with React 18, PatternFly 6, and Redux Toolkit.

## Features

- **Dashboard** with certificate summary cards, expiring-soon alerts, and quick actions
- **Certificate management** — browse, search by Subject DN or SAN, view details, revoke
- **Enrollment** — submit certificate signing requests via configurable profiles
- **Request workflow** — approve, reject, or cancel pending requests
- **Profile management** — view, clone, and edit certificate profiles
- **Authorities** — view sub-CA hierarchy
- **Audit log** viewer
- **Role-based access control** — three roles (Administrator, Agent, Auditor) with server-side enforcement
- **Session auth** — HMAC-signed cookies, rate limiting, CSRF protection
- **Container-ready** — multi-stage UBI 9 container build with nginx

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Browser                                        │
│  React 18 + PatternFly 6 + Redux Toolkit        │
└───────────────────┬─────────────────────────────┘
                    │ /webui/api/auth/*  (login/logout/session)
                    │ /ca/rest/*         (PKI operations)
                    ▼
┌─────────────────────────────────────────────────┐
│  Vite Dev Server / nginx (production)           │
│  ┌─────────────┐  ┌──────────────────────────┐  │
│  │ Auth plugin  │  │ RBAC middleware          │  │
│  │ - sessions   │  │ - route → role mapping   │  │
│  │ - rate limit │  │ - 403 on insufficient    │  │
│  │ - CSRF check │  │   permissions            │  │
│  └─────────────┘  └──────────────────────────┘  │
└───────────────────┬─────────────────────────────┘
                    │ mTLS (client certificate)
                    ▼
┌─────────────────────────────────────────────────┐
│  Dogtag CA (port 8443)                          │
│  REST API: /ca/rest/*                           │
└─────────────────────────────────────────────────┘
```

**Key design decisions:**

- Dogtag authenticates by client certificate only (Basic auth is ignored when a cert is presented). The WebUI adds its own session-based auth layer with a pluggable `AuthBackend` interface.
- Server-side RBAC middleware checks the user's session roles against a URL pattern map before proxying to Dogtag. Client-side nav filtering is cosmetic only — the server enforces access.
- A demo auth backend with built-in users is active in development. For production, implement the `AuthBackend` interface with LDAP bind or another directory.

## Quick Start

### Prerequisites

- Node.js >= 18
- A running Dogtag CA instance (default: `https://localhost:8443`)
- Admin client certificate and key from the CA

### Development

```bash
# Install dependencies
npm install

# Place your CA admin cert and key
mkdir -p certs/
cp /path/to/admin.cert certs/admin.cert
cp /path/to/admin.key certs/admin.key

# (Optional) Copy and edit environment config
cp .env.example .env

# Start the dev server
npm run dev

# Open http://localhost:5173
# Demo login: caadmin / Secret.123
```

### Container

```bash
# Build
podman build -t dogtag-webui .

# Run (point to your CA)
podman run -d -p 8080:8080 \
  -e CA_TARGET_URL=https://ca.example.com:8443 \
  dogtag-webui
```

The container uses a multi-stage build: UBI 9 nodejs-18-minimal for the build stage, UBI 9 nginx-122 for runtime. It runs as non-root (UID 1001).

### Ansible

Full provisioning playbooks for 389 DS + Dogtag CA and the WebUI container are in a separate repo: [ansible-dogtagpki](https://github.com/Amy-Ra-lph/ansible-dogtagpki).

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server with API proxy and auth |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run ESLint |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_CA_TARGET_URL` | `https://localhost:8443` | Dogtag CA backend URL |
| `VITE_CA_CERT_PATH` | `certs/admin.cert` | Client certificate for CA proxy |
| `VITE_CA_KEY_PATH` | `certs/admin.key` | Client key for CA proxy |
| `VITE_DEV_HOST` | `localhost` | Dev server bind address |
| `CA_TARGET_URL` | `https://localhost:8443` | CA URL for container nginx proxy |
| `VITE_LDAP_URL` | *(unset = demo mode)* | LDAP server URL (e.g., `ldap://localhost:389`) |
| `VITE_LDAP_BASE_DN` | `o=pki-tomcat-CA` | LDAP base DN |
| `VITE_LDAP_BIND_DN` | *(optional)* | DN for LDAP search bind (e.g., `cn=Directory Manager`) |
| `VITE_LDAP_BIND_PASSWORD` | *(optional)* | Password for LDAP search bind |
| `VITE_LDAP_USER_SEARCH_BASE` | `ou=people,{baseDn}` | Base DN for user lookups |
| `VITE_LDAP_GROUP_SEARCH_BASE` | `ou=groups,{baseDn}` | Base DN for group lookups |
| `VITE_LDAP_TLS_REJECT_UNAUTHORIZED` | `true` | Set `false` for self-signed DS certs |

### LDAP Authentication

When `VITE_LDAP_URL` is set, the WebUI authenticates users against 389 Directory Server instead of the built-in demo accounts. The backend:

1. Searches `ou=people` for the user's DN by `uid`
2. Binds as the user to verify the password
3. Searches `ou=groups` for `groupOfUniqueNames` entries containing the user
4. Maps Dogtag groups to WebUI roles:

| LDAP Group | WebUI Role |
|------------|------------|
| `Administrators` | administrator |
| `Certificate Manager Agents` | agent |
| `Auditors` | auditor |

Users with no mapped group memberships are denied login.

## Roles and Permissions

| Page | Administrator | Agent | Auditor |
|------|:---:|:---:|:---:|
| Dashboard | Y | Y | Y |
| Certificates | Y | Y | Y |
| Authorities | Y | Y | Y |
| Enroll | Y | Y | - |
| Requests | Y | Y | - |
| Profiles | Y | Y | - |
| Create Profile | Y | - | - |
| Users / Groups | Y | - | - |
| Audit Log | Y | - | Y |
| CC Compliance | Y | - | Y |

Demo accounts for development:

| Username | Password | Roles |
|----------|----------|-------|
| `caadmin` | `Secret.123` | Administrator, Agent |
| `agent1` | `agent123` | Agent |
| `auditor1` | `auditor123` | Auditor |

## Project Structure

```
src/
  app/            App shell (PatternFly Page layout, masthead, logout)
  auth/           Role definitions and helpers
  components/     Shared UI (ProtectedRoute, breadcrumbs)
  navigation/     Route definitions, sidebar nav, role-based filtering
  pages/          Page components (one per feature area)
  services/       RTK Query API definitions (Dogtag REST)
  store/          Redux store, auth slice, typed hooks
server/
  authMiddleware.ts   Auth plugin (sessions, RBAC, rate limiting, CSRF)
nginx/
  dogtag-webui.conf   Standalone nginx config
  container.conf      Container nginx config with security headers
ansible/              Symlinked playbooks (see ansible-dogtagpki repo)
certs/                Client certs for CA proxy (not tracked in git)
```

## Security

See [SECURITY.md](SECURITY.md) for the full security audit results, including 20 resolved findings and 4 open architectural items with remediation recommendations.

Key security features:
- HMAC-signed session cookies with timing-safe verification
- Rate limiting (5 attempts per IP per 15 minutes)
- CSRF protection via Origin/Referer validation
- Server-side RBAC enforcement on all `/ca/rest/` routes
- Security headers (CSP, HSTS, X-Frame-Options, etc.)
- Error message sanitization (no stack traces, 200-char cap)
- Non-root container runtime

## License

GPL-3.0-or-later
