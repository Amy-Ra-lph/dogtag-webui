# Design: SPIRE and Sigstore Visibility Pages for Dogtag PKI WebUI

**Status:** Draft
**Date:** 2026-04-20

---

## 1. Problem Statement

SPIRE issues X.509 SVIDs and Fulcio issues short-lived code-signing certificates, both
chaining to Dogtag PKI as the root CA. These certificates exist in the Dogtag certificate
database but there is no way to distinguish them from standard PKI certificates in the
WebUI. Operators cannot answer basic questions without CLI tooling:

- Which workloads have active SVIDs? Are they rotating properly?
- Who signed code through Fulcio in the last 24 hours? Can I verify the transparency log entry?
- What does the full trust hierarchy look like from Dogtag root through SPIRE/Fulcio intermediates?

This design adds three new pages and dashboard enhancements to surface workload identity,
code-signing activity, and trust-chain structure directly in the WebUI.

---

## 2. Goals and Non-Goals

### Goals
- Surface SPIRE-issued SVIDs by filtering Dogtag certs on SPIFFE URI SAN pattern
- Display Fulcio code-signing certificates with signer identity and optional Rekor cross-reference
- Visualize the CA trust chain from Dogtag root through SPIRE and Fulcio intermediates
- Add dashboard summary cards for SVID count, recent code-signing activity, and trust chain health
- Reuse existing RTK Query patterns and PatternFly 6 components

### Non-Goals
- Managing SPIRE registrations (creating/deleting workload entries) from the WebUI
- Writing to the Rekor transparency log
- Replacing the SPIRE Server admin CLI or Fulcio admin tooling
- Supporting trust domains other than the configured one in a single deployment
- Certificate enrollment for SPIRE or Fulcio (these systems handle their own issuance)

---

## 3. Proposed Pages

### 3A. Workload Identities (`/workload-identities`)

**Purpose:** List all SPIRE-issued X.509 SVIDs tracked by Dogtag.

**Data source:** Dogtag CA REST API cert search, filtered to certificates whose SAN
contains a URI matching `spiffe://`. The `PrettyPrint` field from the agent cert endpoint
already contains SAN data; the existing `extractSANs` utility in `src/utils/certUtils.ts`
will be extended to also capture `URIName` entries.

**Table columns:**

| Column | Source |
|--------|--------|
| SPIFFE ID | Extracted from URI SAN (`spiffe://trust-domain/path`) |
| Serial | `CertInfo.id` |
| Trust Domain | Parsed from SPIFFE ID (hostname portion) |
| Workload Path | Parsed from SPIFFE ID (path portion after trust domain) |
| Issued | `CertInfo.IssuedOn` (epoch ms) |
| Expires | `CertInfo.NotValidAfter` (epoch ms) |
| Status | `CertInfo.Status` |

**Detail view:** Clicking a row navigates to `/workload-identities/:certId`, which
renders the full cert chain using the `CertChainViewer` component (Section 7). The chain
is reconstructed from `PKCS7CertChain` or by walking `IssuerDN` through the authorities
list: Dogtag Root CA -> SPIRE Intermediate -> SVID leaf.

**Filtering:** Text filter on SPIFFE ID, dropdown filter on trust domain, status filter
(VALID / REVOKED / EXPIRED).

**Role access:** `administrator`, `agent`

### 3B. Code Signing Activity (`/code-signing`)

**Purpose:** List Fulcio-issued code-signing certificates and optionally cross-reference
with Rekor transparency log entries.

**Data source:** Dogtag cert search filtered by one of:
1. Extended Key Usage OID `1.3.6.1.5.5.7.3.3` (code signing) in `PrettyPrint`
2. `IssuerDN` matching the configured Fulcio intermediate DN

**Table columns:**

| Column | Source |
|--------|--------|
| Signer Identity | OIDC subject extracted from SAN `RFC822Name` or custom extension |
| Serial | `CertInfo.id` |
| Issued | `CertInfo.IssuedOn` |
| Valid Until | `CertInfo.NotValidAfter` |
| Validity Window | Computed (`NotValidAfter - NotValidBefore`, typically 10-20 min) |
| Rekor Entry | Link to Rekor log entry if Rekor API is configured and a match is found |

**Rekor integration:** When `VITE_REKOR_URL` is configured, the page queries the Rekor
search API (`/api/v1/index/retrieve`) by certificate SHA-256 fingerprint. If a log entry
exists, the table shows a verification badge and the Rekor log index. This call goes
through the nginx proxy (see Section 8).

**Role access:** `administrator`, `auditor`

### 3C. Trust Chain Visualization (`/trust-chain`)

**Purpose:** Interactive tree view of the full CA hierarchy including SPIRE and Fulcio
intermediates.

**Data source:** Combines the existing `useGetAuthoritiesQuery()` response with cert
chain analysis. The authorities endpoint returns `AuthorityData[]` with `dn`, `issuerDN`,
and `isHostAuthority` fields, which provide the parent-child relationships.

**Rendering:** A vertical tree layout using nested PatternFly `TreeView` or a custom SVG
tree. Each node displays:
- CA common name (parsed from DN)
- Status indicator (enabled/disabled/ready)
- Certificate count badge (number of leaf certs issued by this CA)
- Node type label: "Root CA", "SPIRE Intermediate", "Fulcio Intermediate", "Sub-CA"

Node type is determined by heuristic: if any cert issued by an authority has a SPIFFE URI
SAN, it is labeled "SPIRE Intermediate". If any cert has the code-signing EKU, it is
labeled "Fulcio Intermediate".

**Interaction:** Click a node to expand a side panel with the CA cert details
(subject, issuer, validity, key info). Click "View Certificates" to navigate to the
filtered cert list for that issuer.

**Role access:** `administrator`

### 3D. Dashboard Enhancements

Three new summary cards in the existing `Gallery` on the Dashboard page:

1. **Active SVIDs** -- Count of VALID certs with SPIFFE URI SAN. Clicks through to
   `/workload-identities`. Shows a warning badge if any SVIDs expired in the last hour
   (indicates rotation failure).

2. **Code Signing (24h)** -- Count of Fulcio certs issued in the last 24 hours. Clicks
   through to `/code-signing`.

3. **Trust Chain Health** -- Green/yellow/red indicator. Green = all intermediates enabled
   and ready. Yellow = one or more intermediates not ready. Red = an intermediate is
   disabled. Clicks through to `/trust-chain`.

These cards only render when the feature is configured (environment variables present) to
avoid clutter in deployments without SPIRE/Sigstore.

---

## 4. API Design

### 4.1 New RTK Query Endpoints

Added to the existing `dogtagApi` in `src/services/dogtagApi.ts`:

```typescript
// New tag type
tagTypes: [...existing, "WorkloadCerts", "CodeSigningCerts"],

// SVID cert search -- filters by SAN containing spiffe://
getSvidCerts: build.query<CertCollection, {
  start?: number;
  size?: number;
  status?: string;
}>({
  query: (params) => ({
    url: "agent/certs",
    params: {
      ...params,
      // Dogtag supports SAN search via the certSearchRequest XML/JSON
      // but the REST API filter is limited. We fetch and filter client-side
      // until a server-side SAN filter is available.
    },
  }),
  providesTags: ["WorkloadCerts"],
}),

// Single SVID cert detail (reuses existing agent cert endpoint)
getSvidCertDetail: build.query<CertDetail, string>({
  query: (id) => `agent/certs/${id}`,
  providesTags: (_r, _e, id) => [{ type: "WorkloadCerts", id }],
}),
```

Because Dogtag's REST API does not natively support filtering by SAN content, the initial
implementation fetches certs in batches and filters client-side by parsing `PrettyPrint`
for `URIName: spiffe://`. A future optimization is to add a server-side search parameter
to Dogtag (tracked as an open question).

### 4.2 Rekor API Service

A separate RTK Query API instance for the optional Rekor integration:

```typescript
// src/services/rekorApi.ts
import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

export interface RekorEntry {
  uuid: string;
  body: string;           // base64-encoded entry body
  integratedTime: number;
  logID: string;
  logIndex: number;
  verification: {
    inclusionProof: {
      checkpoint: string;
      hashes: string[];
      logIndex: number;
      rootHash: string;
      treeSize: number;
    };
    signedEntryTimestamp: string;
  };
}

export interface RekorSearchResult {
  [uuid: string]: RekorEntry;
}

export const rekorApi = createApi({
  reducerPath: "rekorApi",
  baseQuery: fetchBaseQuery({
    baseUrl: "/rekor/api/v1/",   // proxied through nginx
    timeout: 10_000,
  }),
  endpoints: (build) => ({
    searchByHash: build.query<string[], string>({
      query: (hash) => ({
        url: "index/retrieve",
        method: "POST",
        body: { hash: `sha256:${hash}` },
      }),
    }),
    getEntry: build.query<RekorSearchResult, string>({
      query: (uuid) => `log/entries/${uuid}`,
    }),
  }),
});

export const { useSearchByHashQuery, useGetEntryQuery } = rekorApi;
```

### 4.3 Dogtag Cert Search Strategy

Dogtag's `/ca/rest/agent/certs` endpoint supports query parameters for basic search
(serial range, status, subject). For SAN-based filtering, two approaches:

1. **Client-side filter (Phase 1):** Fetch certs with `size=100` pagination, request
   `PrettyPrint` via the detail endpoint for each, and filter for `URIName: spiffe://` or
   code-signing EKU. Cache results aggressively with RTK Query tags.

2. **Server-side filter (Phase 2):** Contribute a `san` query parameter to Dogtag
   upstream that performs an LDAP search on the `subjectAltName` indexed attribute in the
   certificate database. This eliminates the N+1 detail fetch.

---

## 5. Navigation Changes

Add a new "Workload Identity" nav section in `src/navigation/NavRoutes.ts`:

```typescript
{
  label: "Workload Identity",
  items: [
    {
      label: "Workload Identities",
      group: "workload-identities",
      path: "/workload-identities",
      title: `${BASE_TITLE} - Workload Identities`,
      requiredRoles: [ROLE_ADMIN, ROLE_AGENT],
    },
    {
      label: "Code Signing",
      group: "code-signing",
      path: "/code-signing",
      title: `${BASE_TITLE} - Code Signing Activity`,
      requiredRoles: [ROLE_ADMIN, ROLE_AUDITOR],
    },
    {
      label: "Trust Chain",
      group: "trust-chain",
      path: "/trust-chain",
      title: `${BASE_TITLE} - Trust Chain`,
      requiredRoles: [ROLE_ADMIN],
    },
  ],
},
```

New routes added to `src/navigation/AppRoutes.tsx`:

```tsx
<Route path="/workload-identities" element={
  <P roles={[ROLE_ADMIN, ROLE_AGENT]}><WorkloadIdentities /></P>
} />
<Route path="/workload-identities/:certId" element={
  <P roles={[ROLE_ADMIN, ROLE_AGENT]}><WorkloadIdentityDetail /></P>
} />
<Route path="/code-signing" element={
  <P roles={[ROLE_ADMIN, ROLE_AUDITOR]}><CodeSigning /></P>
} />
<Route path="/trust-chain" element={
  <P roles={[ROLE_ADMIN]}><TrustChain /></P>
} />
```

The nav section renders between "Monitoring" and "Compliance" in the sidebar. When neither
`VITE_SPIRE_API_URL` nor `VITE_REKOR_URL` is set, the section still appears (the data
comes from Dogtag's cert database regardless), but the Rekor cross-reference column in
Code Signing is hidden.

---

## 6. Configuration

Environment variables (set at build time via Vite or at runtime via nginx env substitution):

```
# Optional: SPIRE Server Registration API (not used in Phase 1, reserved for future)
VITE_SPIRE_API_URL=https://spire-server.example.com:8081

# Optional: Rekor transparency log API
VITE_REKOR_URL=https://rekor.example.com:3000

# Required for code-signing page: Fulcio intermediate issuer DN
VITE_FULCIO_ISSUER_DN=CN=Fulcio Intermediate,O=sigstore

# Trust domain displayed on workload identity page (informational)
VITE_SPIFFE_TRUST_DOMAIN=test.example.com
```

Runtime config object in `src/config/spireConfig.ts`:

```typescript
export interface SpireSigstoreConfig {
  spireApiUrl: string | null;
  rekorUrl: string | null;
  fulcioIssuerDN: string | null;
  trustDomain: string | null;
}

export const spireSigstoreConfig: SpireSigstoreConfig = {
  spireApiUrl: import.meta.env.VITE_SPIRE_API_URL ?? null,
  rekorUrl: import.meta.env.VITE_REKOR_URL ?? null,
  fulcioIssuerDN: import.meta.env.VITE_FULCIO_ISSUER_DN ?? null,
  trustDomain: import.meta.env.VITE_SPIFFE_TRUST_DOMAIN ?? null,
};
```

Nginx proxy additions in the container build:

```nginx
# Rekor API proxy (only if REKOR_URL is set)
location /rekor/ {
    proxy_pass ${REKOR_URL}/;
    proxy_set_header Host $host;
    proxy_read_timeout 10s;
}
```

---

## 7. Component Architecture

### New TypeScript Types

```typescript
// src/types/spire.ts

/** Parsed SPIFFE ID components */
export interface SpiffeId {
  raw: string;              // "spiffe://test.example.com/workload/web-server"
  trustDomain: string;      // "test.example.com"
  workloadPath: string;     // "/workload/web-server"
}

/** SVID record derived from a Dogtag CertInfo + PrettyPrint parsing */
export interface SvidRecord {
  certId: string;
  spiffeId: SpiffeId;
  serialNumber: string;
  subjectDN: string;
  issuerDN: string;
  issuedOn: number;         // epoch ms
  notValidBefore: number;
  notValidAfter: number;
  status: string;
}

/** Code-signing cert record */
export interface CodeSigningRecord {
  certId: string;
  serialNumber: string;
  signerIdentity: string;   // OIDC subject from cert SAN or extension
  issuerDN: string;
  issuedOn: number;
  notValidBefore: number;
  notValidAfter: number;
  validityWindowMinutes: number;
  status: string;
  rekorLogIndex?: number;
  rekorUuid?: string;
}

/** Trust chain tree node */
export interface TrustChainNode {
  id: string;               // authority ID or cert serial
  dn: string;
  issuerDN: string | null;
  label: string;            // parsed CN
  nodeType: "root" | "spire-intermediate" | "fulcio-intermediate" | "sub-ca";
  enabled: boolean;
  ready: boolean;
  certCount: number;
  children: TrustChainNode[];
}
```

### Reusable Components

**`CertChainViewer`** (`src/components/CertChainViewer.tsx`)
- Props: `chain: Array<{ label: string; dn: string; serial: string; isLeaf: boolean }>`
- Renders a vertical chain with connecting lines. Each step is a PatternFly `Card` with
  condensed cert info. The leaf node is visually distinct (outlined card).
- Reusable on the workload identity detail page, code-signing detail, and trust chain page.

**`SPIFFEIDBadge`** (`src/components/SPIFFEIDBadge.tsx`)
- Props: `spiffeId: SpiffeId`
- Renders a PatternFly `Label` with monospace font. Trust domain in grey, workload path
  in bold. Clicking copies the full SPIFFE ID to clipboard.

**`RekorVerificationBadge`** (`src/components/RekorVerificationBadge.tsx`)
- Props: `logIndex: number; uuid: string; verified: boolean`
- Green checkmark label when verified, grey "unverified" when Rekor is unavailable.
  Hovering shows the log index and entry UUID.

**`ValidityBar`** (`src/components/ValidityBar.tsx`)
- Props: `notBefore: number; notAfter: number`
- A narrow horizontal progress bar showing where "now" falls within the cert validity
  window. Useful for short-lived Fulcio certs and SVIDs to visualize remaining lifetime.

### Utility Extensions

Extend `src/utils/certUtils.ts`:

```typescript
/** Extract URI SANs from PrettyPrint text */
export function extractURISANs(prettyPrint: string): string[] {
  const uris: string[] = [];
  const lines = prettyPrint.split("\n");
  let inSAN = false;
  for (const line of lines) {
    if (line.includes("Subject Alternative Name")) {
      inSAN = true;
      continue;
    }
    if (inSAN) {
      const uri = line.match(/URIName:\s*(.+)/);
      if (uri) uris.push(uri[1].trim());
      if (line.includes("Identifier:") && !line.includes("Subject Alternative")) {
        inSAN = false;
      }
    }
  }
  return uris;
}

/** Parse a SPIFFE ID URI into components */
export function parseSpiffeId(uri: string): SpiffeId | null {
  const match = uri.match(/^spiffe:\/\/([^/]+)(\/.*)?$/);
  if (!match) return null;
  return {
    raw: uri,
    trustDomain: match[1],
    workloadPath: match[2] ?? "/",
  };
}

/** Check if PrettyPrint contains the code-signing EKU */
export function hasCodeSigningEKU(prettyPrint: string): boolean {
  return prettyPrint.includes("1.3.6.1.5.5.7.3.3");
}

/** Extract OIDC subject from cert (RFC822Name SAN or custom extension) */
export function extractSignerIdentity(prettyPrint: string): string | null {
  const lines = prettyPrint.split("\n");
  let inSAN = false;
  for (const line of lines) {
    if (line.includes("Subject Alternative Name")) {
      inSAN = true;
      continue;
    }
    if (inSAN) {
      const email = line.match(/RFC822Name:\s*(.+)/);
      if (email) return email[1].trim();
      if (line.includes("Identifier:") && !line.includes("Subject Alternative")) {
        break;
      }
    }
  }
  return null;
}
```

---

## 8. Security Considerations

### RBAC

All new pages follow the existing `ProtectedRoute` pattern with `requiredRoles`:

| Page | Roles |
|------|-------|
| Workload Identities | `administrator`, `agent` |
| Code Signing | `administrator`, `auditor` |
| Trust Chain | `administrator` |

The agent cert endpoint (`/ca/rest/agent/certs`) already requires agent or admin
privileges. No new Dogtag RBAC configuration is needed.

### Proxy Configuration

The Rekor API proxy in nginx must:
- Only be enabled when `REKOR_URL` is set
- Restrict to GET and POST methods
- Set a 10-second read timeout to prevent hanging connections
- Not forward authentication cookies (Rekor is a public log)

The SPIRE API proxy (Phase 2) would require mTLS configuration since the SPIRE
registration API uses client certificates. This is deferred.

### Data Sensitivity

SPIFFE IDs contain workload topology information (trust domain, service paths). The
Workload Identities page is restricted to `administrator` and `agent` roles to prevent
information disclosure to lower-privilege users.

Signer identities on the Code Signing page may contain email addresses (OIDC subjects).
These are already present in the certificate SAN and visible through the existing
Certificate Detail page, so no new exposure is introduced.

---

## 9. Effort Estimate

| Component | Estimate | Notes |
|-----------|----------|-------|
| Type definitions (`spire.ts`) | 0.5 day | Straightforward interfaces |
| Utility extensions (`certUtils.ts`) | 1 day | URI SAN parsing + tests |
| `rekorApi.ts` service | 1 day | New RTK Query API + store registration |
| `dogtagApi.ts` SVID endpoints | 0.5 day | Extends existing API slice |
| Config module (`spireConfig.ts`) | 0.5 day | Env var wiring |
| Workload Identities page | 3 days | Table, filters, pagination, detail view |
| Code Signing page | 3 days | Table, Rekor cross-reference, detail view |
| Trust Chain page | 3 days | Tree visualization, side panel, node classification |
| Dashboard cards | 1 day | Three cards with conditional rendering |
| Reusable components (4) | 2 days | CertChainViewer, SPIFFEIDBadge, RekorBadge, ValidityBar |
| Navigation + routing | 0.5 day | NavRoutes, AppRoutes, imports |
| Nginx proxy config | 0.5 day | Rekor location block, env substitution |
| Tests | 3 days | Unit tests for utils, component tests, API mock tests |
| **Total** | **~20 days** | Single developer |

---

## 10. Open Questions

1. **Server-side SAN filtering:** Dogtag's REST API does not support searching certs by
   SAN content. The client-side filter works for small deployments but will not scale past
   a few thousand certificates. Should we contribute a SAN search parameter upstream, or
   add a custom Dogtag plugin?

2. **SPIRE Registration API access:** Phase 1 reads only from Dogtag's cert database.
   Should Phase 2 query the SPIRE Server registration API to show workload entry metadata
   (selectors, parent ID, downstream status) alongside the SVID data? This would require
   mTLS proxy configuration.

3. **Rekor verification depth:** The current design checks for log inclusion only. Should
   we also verify the Signed Entry Timestamp (SET) and inclusion proof client-side, or is
   presence in the log sufficient for the UI use case?

4. **Short-lived cert volume:** Fulcio certs have 10-20 minute validity. In active
   environments, the Dogtag cert database could contain thousands of expired signing
   certs. Should the Code Signing page default to showing only the last 24 hours, or show
   all with a date range filter?

5. **Tree rendering library:** The Trust Chain page needs a tree visualization. Options:
   (a) PatternFly `TreeView` component (simple, limited layout control),
   (b) custom SVG with D3 tree layout (flexible, added dependency),
   (c) CSS-only nested cards (no new dependencies, less visual).
   Which approach fits the project's dependency posture?

6. **Dashboard card visibility:** Should the SPIRE/Sigstore dashboard cards always be
   visible (showing zero counts when no SVIDs exist), or should they be hidden entirely
   when the environment variables are not configured?
