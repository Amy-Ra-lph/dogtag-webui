# Dogtag PKI WebUI

A modern web interface for [Dogtag PKI](https://www.dogtagpki.org/) (upstream of Red Hat Certificate System), built with React 18, PatternFly 6, and Redux Toolkit.

## Features

- **Dashboard** with certificate summary cards, expiring-soon alerts, and quick actions
- **Certificate management** — browse, search by Subject DN or SAN, view details, revoke
- **SPIRE SVID visibility** — filter certs by spiffe:// URI SAN, cross-reference with SPIRE entries
- **Code-signing dashboard** — filter by code-signing EKU, Rekor transparency log cross-reference
- **Trust chain visualization** — interactive CA hierarchy view
- **Enrollment** — submit certificate signing requests via configurable profiles
- **Request workflow** — approve, reject, or cancel pending requests
- **Profile management** — view, clone, and edit certificate profiles (including custom svidCert and codeSigningCert profiles)
- **Authorities** — view sub-CA hierarchy
- **Audit log** viewer
- **Role-based access control** — three roles (Administrator, Agent, Auditor) with server-side enforcement
- **Dual auth** — username/password or client certificate (mTLS)
- **Container-ready** — multi-stage UBI 10 container build with nginx + Fastify backend

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Browser                                        │
│  React 18 + PatternFly 6 + Redux Toolkit        │
└───────────────────┬─────────────────────────────┘
                    │ HTTPS + optional client cert (mTLS)
                    ▼
┌─────────────────────────────────────────────────┐
│  nginx (TLS termination, mTLS handler)          │
│  - ssl_verify_client optional_no_ca             │
│  - X-SSL-Client-Cert/Verify/S-DN headers        │
│  - Security headers (CSP, HSTS, etc.)           │
└───────────────────┬─────────────────────────────┘
                    │ HTTP → localhost:3000
                    ▼
┌─────────────────────────────────────────────────┐
│  Fastify Backend (unprivileged, no standing     │
│  credentials)                                   │
│  ┌─────────────┐  ┌──────────────────────────┐  │
│  │ Auth routes  │  │ Per-user CA proxy        │  │
│  │ - password   │  │ - session relay          │  │
│  │ - cert login │  │ - RBAC enforcement       │  │
│  │ - sessions   │  │ - Dogtag cookie mgmt     │  │
│  └─────────────┘  └──────────────────────────┘  │
│  ┌─────────────┐  ┌──────────────────────────┐  │
│  │ Rekor proxy │  │ SPA static files         │  │
│  │ (passthru)  │  │ (dist/)                  │  │
│  └─────────────┘  └──────────────────────────┘  │
└───────────────────┬─────────────────────────────┘
                    │ per-user credentials
                    ▼
┌─────────────────────────────────────────────────┐
│  Dogtag CA (port 8443)                          │
│  REST API: /ca/rest/*                           │
│  Authenticated as the actual user               │
└─────────────────────────────────────────────────┘
```

**Key design decisions:**

- **No standing credentials.** The container runs with zero mounted agent or admin certs. Each user authenticates with their own credentials (password or client certificate), and the Fastify backend relays their Dogtag session. Dogtag's native RBAC governs what each user can do.
- **Dual auth.** Users can authenticate via username/password (forwarded to Dogtag via Basic auth) or via client certificate (mTLS at the nginx layer, cert forwarded to Dogtag for session establishment).
- **Server-side RBAC.** The backend checks the user's session roles against a URL pattern map before proxying to Dogtag. Client-side nav filtering is cosmetic only — the server enforces access.
- **In-memory sessions.** Per-user Dogtag sessions are stored in server memory with 30-minute TTL, 5-minute role re-validation, and automatic expiry sweep. No credentials are written to disk.

## Quick Start

### Prerequisites

- Node.js >= 18
- A running Dogtag CA instance (default: `https://localhost:8443`)

### Development

```bash
# Install dependencies
npm install

# (Optional) Copy and edit environment config
cp .env.example .env

# Start the dev server (frontend only, with Vite auth middleware)
npm run dev

# Or start the full stack (Fastify backend + Vite frontend)
npm run build:server
VITE_BACKEND_URL=http://localhost:3000 npm run dev &
CA_TARGET_URL=https://your-ca:8443 npm run dev:server

# Open http://localhost:5173
# Demo login: caadmin / Secret.123
```

### Container

```bash
# Build
podman build -t dogtag-webui .

# Run (no agent cert needed — users authenticate with their own credentials)
podman run -d -p 8080:8080 \
  -e CA_TARGET_URL=https://ca.example.com:8443 \
  dogtag-webui

# With TLS (mount server cert for HTTPS + optional mTLS)
podman run -d -p 8080:8080 -p 8443:8443 \
  -e CA_TARGET_URL=https://ca.example.com:8443 \
  -v /path/to/tls.crt:/etc/nginx/certs/tls.crt:ro,z \
  -v /path/to/tls.key:/etc/nginx/certs/tls.key:ro,z \
  dogtag-webui

# With Rekor transparency log
podman run -d -p 8080:8080 \
  -e CA_TARGET_URL=https://ca.example.com:8443 \
  -e REKOR_URL=http://rekor.example.com:3000 \
  dogtag-webui
```

The container uses a multi-stage build: UBI 10 with Node.js 24 for the build stage, UBI 10 with nginx + Node.js 24 for runtime. It runs as non-root (UID 1001). The entrypoint starts the Fastify backend, waits for its health check, then starts nginx as PID 1.

### Ansible

Full provisioning playbooks for 389 DS + Dogtag CA and the WebUI container are in a separate repo: [ansible-dogtagpki](https://github.com/Amy-Ra-lph/ansible-dogtagpki).

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server with API proxy and auth |
| `npm run dev:server` | Start Fastify backend in dev mode |
| `npm run build` | Type-check and build SPA for production |
| `npm run build:server` | Bundle Fastify backend with esbuild |
| `npm run start:server` | Run production Fastify backend |
| `npm run lint` | Run ESLint |
| `npm test` | Run all tests (128 tests across server + client) |

## Environment Variables

### Container / Backend

| Variable | Default | Description |
|----------|---------|-------------|
| `CA_TARGET_URL` | `https://localhost:8443` | Dogtag CA backend URL |
| `REKOR_URL` | *(unset)* | Rekor transparency log URL (enables `/rekor/api/v1/` proxy) |
| `BACKEND_PORT` | `3000` | Fastify backend listen port |
| `CA_TLS_REJECT_UNAUTHORIZED` | `false` | Set `true` for production (validates CA's TLS cert) |
| `CA_BUNDLE` | *(optional)* | Path to CA chain PEM for verifying Dogtag's TLS cert |
| `CLIENT_CA_CERT` | *(optional)* | Client CA cert for nginx mTLS verification |
| `LDAP_URL` | *(unset = Dogtag-only auth)* | LDAP server URL for fallback auth |
| `LDAP_BASE_DN` | `o=pki-tomcat-CA` | LDAP base DN |
| `LDAP_BIND_DN` | *(optional)* | DN for LDAP search bind |
| `LDAP_BIND_PASSWORD` | *(optional)* | Password for LDAP search bind |
| `LDAP_USER_SEARCH_BASE` | `ou=people,{baseDn}` | Base DN for user lookups |
| `LDAP_GROUP_SEARCH_BASE` | `ou=groups,{baseDn}` | Base DN for group lookups |
| `LDAP_TLS_REJECT_UNAUTHORIZED` | `true` | Set `false` for self-signed DS certs |
| `LDAP_TLS_CA_CERT` | *(optional)* | Path to CA cert for verifying DS server cert |
| `LDAP_STARTTLS` | `false` | Use STARTTLS on plain LDAP port (389) |

### Vite Dev Server

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_CA_TARGET_URL` | `https://localhost:8443` | Dogtag CA backend URL (dev proxy mode) |
| `VITE_CA_CERT_PATH` | `certs/agent.cert` | Client cert for dev proxy (legacy mode) |
| `VITE_CA_KEY_PATH` | `certs/agent.key` | Client key for dev proxy (legacy mode) |
| `VITE_BACKEND_URL` | *(unset)* | If set, Vite proxies to Fastify backend instead of direct to CA |
| `VITE_DEV_HOST` | `localhost` | Dev server bind address |
| `VITE_LDAP_URL` | *(unset = demo mode)* | LDAP URL for Vite auth middleware |

### Authentication

The production backend authenticates users in two ways:

**Password login:**
1. User submits username/password
2. Backend authenticates to Dogtag via Basic auth (`/ca/rest/account/login`)
3. Dogtag returns a session cookie (JSESSIONID) and account info (roles)
4. Backend stores the Dogtag session, returns a WebUI session cookie
5. Subsequent API calls use the stored Dogtag session

**Client certificate login (mTLS):**
1. User's browser presents a client cert during TLS handshake
2. nginx passes the cert PEM via `X-SSL-Client-Cert` header
3. Login page detects the cert and shows "Log in with certificate"
4. Backend uses the cert to establish a Dogtag session
5. Same session relay as password flow

Both flows result in per-user Dogtag sessions — the backend holds no standing credentials.

### LDAP Fallback

When `LDAP_URL` is set, the backend falls back to LDAP validation if Dogtag Basic auth fails. Three connection modes are supported:

| Mode | URL | Extra Config |
|------|-----|-------------|
| Plain LDAP | `ldap://host:389` | *(not recommended for production)* |
| LDAPS | `ldaps://host:636` | Set `LDAP_TLS_CA_CERT` if DS uses internal CA |
| STARTTLS | `ldap://host:389` | Set `LDAP_STARTTLS=true` |

## Roles and Permissions

| Page | Administrator | Agent | Auditor |
|------|:---:|:---:|:---:|
| Dashboard | Y | Y | Y |
| Certificates | Y | Y | Y |
| Authorities | Y | Y | Y |
| SPIRE SVIDs | Y | Y | Y |
| Code Signing | Y | Y | Y |
| Trust Chain | Y | Y | Y |
| Enroll | Y | Y | - |
| Requests | Y | Y | - |
| Profiles | Y | Y | - |
| Create Profile | Y | - | - |
| Users / Groups | Y | - | - |
| Audit Log | Y | - | Y |

Demo accounts for development (Vite auth middleware only):

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
  components/     Shared UI (ProtectedRoute, RekorVerificationBadge)
  navigation/     Route definitions, sidebar nav, role-based filtering
  pages/          Page components (Certificates, SpireSvids, CodeSigning, TrustChain, ...)
  services/       RTK Query API definitions (Dogtag REST, Rekor)
  store/          Redux store, auth slice, typed hooks
  utils/          Certificate parsing helpers
server/
  app.ts            Fastify application (auth routes, CA proxy, Rekor proxy, static files)
  index.ts          Server entry point
  sessionStore.ts   In-memory per-user session store
  dogtagAuth.ts     Dogtag authentication (basic auth + client cert)
  caProxy.ts        Per-user CA REST API proxy
  authMiddleware.ts Auth plugin for Vite dev server (sessions, RBAC, rate limiting)
  ldapBackend.ts    LDAP authentication backend
nginx/
  container.conf    Container nginx config (TLS termination, mTLS, security headers)
  docker-entrypoint.sh  Starts Fastify backend + nginx
scripts/
  create-test-certs.sh  Enroll test SVID + code-signing certs
  demo-walkthrough.yml  Demo-recorder YAML for CLI+WebUI walkthrough
  SCREENSHOT-LIST.md    Screenshot capture checklist
docs/
  design-*.md       Integration design documents (SPIRE, Fulcio, Rekor)
certs/              Client certs for dev proxy (not tracked in git)
```

## Security

See [SECURITY.md](SECURITY.md) for the full security audit results.

Key security features:
- Per-user authentication relay (no standing credentials in container)
- Dual auth: password + client certificate (mTLS)
- In-memory session store with 30-minute TTL and automatic expiry sweep
- Periodic role re-validation (every 5 minutes via Dogtag session check)
- Login rate limiting (5 attempts per IP per 15 minutes)
- API write rate limiting (30 requests per minute per session)
- Structured audit logging for all auth events (JSON to stdout)
- CSRF protection via SameSite=Strict cookies
- Server-side RBAC enforcement on all `/ca/rest/` routes
- Configurable TLS validation on backend-to-CA connections (`CA_TLS_REJECT_UNAUTHORIZED`, `CA_BUNDLE`)
- Optional client CA verification at nginx layer (`CLIENT_CA_CERT`)
- XFF spoofing protection (nginx overwrites, Fastify trusts only 127.0.0.1)
- Clear-Site-Data header on logout
- Security headers (CSP, HSTS, X-Frame-Options, etc.)
- Error message sanitization (no stack traces, 200-char cap)
- Non-root container runtime (UID 1001)

## License

GPL-3.0-or-later
