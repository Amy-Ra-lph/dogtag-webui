# Design: SPIRE and Sigstore Integration Strategy for Dogtag PKI

**Status:** Draft
**Date:** 2026-04-20
**Author:** Amy Farley

---

## 1. Executive Summary

This document evaluates whether SPIRE, Fulcio, and Rekor should be embedded as
Dogtag PKI subsystems or integrated through external API bridges, then lays out
a phased strategy for bringing workload identity and code-signing capabilities
into the Dogtag ecosystem.

**Strategic recommendation:** Do not embed SPIRE, Fulcio, or Rekor as Dogtag
subsystems. Instead, pursue three differentiated integration patterns:

- **SPIRE:** Permanent API bridge. SPIRE's agent/server attestation architecture
  is its core value and does not map to Dogtag's request/approve model. SPIRE
  calls Dogtag as an UpstreamAuthority for CA signing and remains a separate
  service indefinitely.

- **Fulcio:** Capability absorption. OIDC-authenticated certificate enrollment
  is fundamentally a CA operation. Dogtag should natively support OIDC token
  validation and short-lived code-signing profiles, making Fulcio an optional
  frontend rather than a required component.

- **Rekor:** Infrastructure consolidation. The transparency log's storage layer
  (Trillian + MariaDB) can be replaced with 389 Directory Server, eliminating
  a database dependency in environments where 389 DS is already deployed for
  Dogtag and FreeIPA.

This approach delivers immediate value through API bridges (weeks 1-4), builds
toward fewer moving parts through capability absorption (weeks 6-14), and offers
a long-term path to infrastructure simplification (weeks 10-20).

Three companion design documents detail the implementation of specific components:

1. [design-spire-upstream-authority.md](design-spire-upstream-authority.md) -- SPIRE UpstreamAuthority plugin for Dogtag (7-12 days)
2. [design-fulcio-dogtag-backend.md](design-fulcio-dogtag-backend.md) -- Fulcio CA backend using Dogtag REST API (8-12 days)
3. [design-webui-spire-sigstore.md](design-webui-spire-sigstore.md) -- WebUI visibility pages for SPIRE/Sigstore (~20 days)

---

## 2. Subsystem Model Analysis

### How Dogtag Subsystems Work Today

Dogtag PKI runs inside a single Tomcat instance (`pki-tomcatd`). Its existing
subsystems -- CA, KRA, OCSP, TKS, and TPS -- are Java web applications deployed
as servlets in the same container. They share critical infrastructure:

```
+---------------------------------------------------------------+
|                     pki-tomcatd (Tomcat)                       |
|                                                               |
|  +------+  +------+  +------+  +------+  +------+            |
|  |  CA  |  | KRA  |  | OCSP |  | TKS  |  | TPS  |            |
|  +--+---+  +--+---+  +--+---+  +--+---+  +--+---+            |
|     |         |         |         |         |                 |
|     +----+----+---------+---------+---------+                 |
|          |                                                    |
|  +-------+--------+  +------------------+  +--------------+   |
|  |  NSS Database   |  |  LDAP (389 DS)   |  | Audit Logger |   |
|  |  (keys, certs)  |  |  (o=ipaca)       |  | (signed log) |   |
|  +-----------------+  +------------------+  +--------------+   |
+---------------------------------------------------------------+
```

This shared infrastructure is the defining characteristic of a Dogtag subsystem:
same JVM, same NSS keystore, same LDAP suffix, same audit framework, same
release cadence. Adding a new subsystem means writing Java code that conforms to
Dogtag's internal APIs and ships with the Dogtag release.

### Why SPIRE, Fulcio, and Rekor Do Not Fit This Model

**Language mismatch.** All three tools are Go. Embedding them means either a
complete Java rewrite (months of effort, permanent fork diverging from upstream)
or a JNI/process wrapper (fragile, defeats shared infrastructure). Neither is
sustainable -- maintaining a Java fork against fast-moving Go upstreams would
exceed the operational savings.

**Architectural mismatch.** Dogtag's model is request/approve: submit CSR,
evaluate against profile, issue or reject. SPIRE uses workload attestation
(node attestors, selectors) to prove identity before issuing certs -- no CSR
in the traditional sense. Cramming attestation into Dogtag's profile framework
would produce a poor imitation of what SPIRE does natively.

**Release cycle coupling.** SPIRE releases every 6-8 weeks; Sigstore iterates
faster. Dogtag follows RHEL's enterprise cadence (months between releases).
Embedding would either force Dogtag to absorb upstream changes at an
unsustainable pace or freeze at a stale version.

**Operational model conflict.** SPIRE is distributed (agents on every host).
Fulcio and Rekor are stateless microservices. Dogtag is a monolithic app
server. Forcing microservices into a monolith yields the worst of both worlds.

### Comparison with Existing Subsystems

The existing subsystems share a property that SPIRE/Fulcio/Rekor do not: they
are all certificate lifecycle operations that naturally extend the CA.

| Subsystem | Relationship to CA | Shares NSS | Shares LDAP | Same Language |
|-----------|--------------------|-----------|-------------|---------------|
| KRA       | Archives keys from CA enrollment | Yes | Yes | Java |
| OCSP      | Publishes revocation status from CA CRL | Yes | Yes | Java |
| TKS       | Derives keys for token operations using CA-enrolled certs | Yes | Yes | Java |
| TPS       | Processes smart card tokens using CA enrollment | Yes | Yes | Java |
| SPIRE     | Requests intermediate CA cert, then operates independently | No | No | Go |
| Fulcio    | Submits CSRs for OIDC-authenticated subjects | No | No | Go |
| Rekor     | No direct CA interaction | No | No | Go |

SPIRE and Fulcio are *consumers* of Dogtag's CA service, not *extensions* of it.
Rekor has no direct CA relationship at all. The correct integration pattern is
to expose Dogtag's capabilities through APIs, not to absorb foreign
architectures into its process.

---

## 3. Integration Spectrum

Each tool maps to a different position on the integration spectrum, based on
how tightly its core functionality overlaps with Dogtag's existing capabilities.

```
Fully Separate          API Bridge          Capability Absorption     Fully Embedded
     |                     |                        |                      |
     |   SPIRE             |                        |                      |
     |-----[==============]|                        |                      |
     |                     |     Fulcio              |                      |
     |                     |------[================]|                      |
     |              Rekor  |                        |                      |
     |          [---------]|========================|                      |
     |                     |                        |                      |
```

| Tool | Recommended Position | Rationale |
|------|---------------------|-----------|
| SPIRE | API bridge | Attestation architecture is SPIRE's value; Dogtag provides CA signing only |
| Fulcio | Capability absorption | OIDC validation + short-lived cert issuance is a CA capability Dogtag can own |
| Rekor | Infrastructure consolidation | Storage backend (Trillian/MariaDB) replaceable with 389 DS; log API stays separate |

**Why not "fully embedded"?** The Go-vs-Java barrier alone makes it
impractical. Even if they were Java, SPIRE's attestation architecture and
Rekor's infrastructure-only relationship argue against subsystem status.

**Why not "fully separate"?** Real operational gains exist: single trust root
with HSM keys, unified audit trail, and fewer databases to operate.

---

## 4. Capability Absorption: OIDC Enrollment in Dogtag

The strongest case for capability absorption is Fulcio. Strip away the Go code
and the Sigstore branding, and Fulcio does two things:

1. Validates an OIDC token against configured issuers.
2. Issues a short-lived X.509 certificate with the OIDC subject in the SAN.

Both of these are CA operations. Dogtag already issues certificates and already
supports pluggable authentication. The gap is an authentication plugin that
speaks OIDC.

### Architecture After Absorption

```
cosign client
    |
    | OIDC token + public key
    v
+-----------------------------------------+
|              Dogtag CA                  |
|                                         |
|  +------------------+                   |
|  | OIDC Auth Plugin |  validates token  |
|  +--------+---------+  against Keycloak |
|           |                             |
|  +--------+---------+                   |
|  | fulcioCodeSigning|  short-lived cert |
|  | profile           |  code signing EKU |
|  +--------+---------+                   |
|           |                             |
|  +--------+---------+                   |
|  | NSS / HSM        |  signs cert       |
|  +------------------+                   |
+-----------------------------------------+
    |
    | signed certificate
    v
cosign client --> Rekor (transparency log)
```

### Implementation Components

**OIDC authentication plugin (Java).** Follows the same pattern as existing
Dogtag auth plugins (`raCertAuth`, `agentCertAuth`) but validates OIDC Bearer
tokens instead of client certs. Validates token signature against issuer's JWKS,
checks `iss`/`aud`/`exp`/`sub` claims, maps OIDC subject to certificate SAN.
Configurable list of trusted issuers (Keycloak, Okta, Azure AD, etc.).

**Code-signing profile.** The `fulcioCodeSigning` profile from
[design-fulcio-dogtag-backend.md](design-fulcio-dogtag-backend.md): 20-minute
validity, code-signing EKU, SAN pass-through.

**Enrollment endpoint.** Uses Dogtag's existing `/ca/rest/certrequests` with
the OIDC auth plugin hooked into the authentication step. No new endpoint.

### Tradeoffs

| Advantage | Disadvantage |
|-----------|-------------|
| Single audit trail (signed Dogtag log + LDAP cert DB) | Java development in Dogtag -- large codebase, slow iteration |
| HSM-protected keys stay in Dogtag's process boundary | Upstream contribution complexity with Dogtag maintainers |
| Unified cert lifecycle (`pki ca-cert-find`, WebUI, IPA) | OIDC logic changes require Dogtag rebuild/redeploy |
| Fewer services (eliminates Fulcio container) | |
| Enterprise OIDC (any issuer, not just Sigstore-specific) | |

### Timeline Bridge

The Fulcio Dogtag REST API backend
([design-fulcio-dogtag-backend.md](design-fulcio-dogtag-backend.md)) is the
short-term solution: Fulcio handles OIDC validation and delegates signing to
Dogtag, providing audit trail and key protection immediately. Phase 3 then
makes Fulcio optional, not obsolete -- organizations wanting the standard
Sigstore workflow can keep it as a thin frontend.

---

## 5. Infrastructure Consolidation: 389 DS as Transparency Log

The current PoC runs Rekor with Trillian backed by MariaDB. This adds two
services (Trillian log server + MariaDB) to an environment that already runs
389 DS for Dogtag and FreeIPA. The infrastructure consolidation thesis: replace
MariaDB with 389 DS as the Trillian storage backend (or replace Trillian
entirely with a custom transparency log using LDAP storage).

### Architecture After Consolidation

```
Rekor REST API --> Transparency Log --> 389 DS (o=sigstore)
                                           |
                                  IPA multi-supplier replication
                                           |
                                  +--------+--------+
                                  |                 |
                              389 DS            389 DS
                              Replica           Replica
```

### Data Model

Merkle tree entries stored under `o=sigstore`, separate from `o=ipaca`:

```
o=sigstore
  ou=trees
    cn=rekor-log
      cn=leaf-N     (objectClass: merkleLeaf, leafValue, integratedTime)
      cn=node-L-R   (objectClass: merkleNode, hash, level)
      cn=tree-head  (objectClass: merkleTreeHead, treeSize, rootHash, signature)
```

### Benefits and Challenges

| Benefits | Challenges |
|----------|------------|
| Eliminates MariaDB dependency | Sequential leaf numbering without SQL AUTO_INCREMENT |
| Free replication via 389 DS multi-supplier | Tree head updates without ACID transactions |
| Unified backup with `ipa-backup` | Write-heavy workload on read-optimized LDAP |
| Append-only via LDAP ACIs + DS plugin | Rekor API compatibility surface if replacing Trillian |

This is the most ambitious phase. Treat it as optional -- pursue only if
MariaDB is a real operational pain point after Phase 1-2 experience.

---

## 6. Phased Integration Plan

```
Week:  1    2    3    4    5    6    7    8    9   10   ...  14   ...  20
       |----Phase 1: API Bridges-----|
                 |----Phase 2: Visibility-----|
                               |--------Phase 3: Capability Absorption--------|
                                              |--------Phase 4: Infra Consolidation--------|
```

### Phase 1: API Bridges (Weeks 1-4)

**Objective:** Connect SPIRE and Fulcio to Dogtag for CA signing. Both tools
stay as separate containers; only the CA backend changes.

**Deliverables:** SPIRE UpstreamAuthority plugin
([design-spire-upstream-authority.md](design-spire-upstream-authority.md)),
Fulcio `dogtagca` backend
([design-fulcio-dogtag-backend.md](design-fulcio-dogtag-backend.md)),
Dogtag profiles (`caSpireIntermediateCA`, `fulcioCodeSigning`), least-privilege
agent certificates.

**Value:** Single trust root, HSM key protection, Dogtag audit trail for all
SPIRE intermediate CA renewals and Fulcio code-signing events.

**Estimated effort:** 15-24 days (two parallel work streams)

### Phase 2: Visibility (Weeks 3-6)

**Objective:** Surface workload identity and code-signing activity in the
Dogtag WebUI. See [design-webui-spire-sigstore.md](design-webui-spire-sigstore.md).

**Deliverables:** Workload Identities page, Code Signing Activity page, Trust
Chain Visualization, Dashboard summary cards.

**Value:** Unified operational view, early warning for SVID rotation failures,
transparency log cross-reference for audit.

**Estimated effort:** ~20 days

### Phase 3: Capability Absorption (Weeks 6-14)

**Objective:** OIDC-authenticated enrollment natively in Dogtag. Fulcio optional.

**Deliverables:** Dogtag OIDC auth plugin (Java), JWKS discovery, issuer
allowlist, OIDC subject-to-SAN mapping, integration tests (`cosign sign`
directly against Dogtag without Fulcio).

**Value:** One fewer service, native enterprise OIDC in Dogtag (extends
beyond Sigstore).

**Estimated effort:** 6-10 weeks

### Phase 4: Infrastructure Consolidation (Weeks 10-20)

**Objective:** Replace Trillian + MariaDB with 389 DS-backed transparency log.

**Deliverables:** LDAP schema for Merkle tree storage (`o=sigstore`), 389 DS
plugin for append-only enforcement, Rekor-compatible API layer, performance
benchmarks, migration tool.

**Value:** Eliminates MariaDB, log replicates via 389 DS multi-supplier
replication, unified backup with `ipa-backup`.

**Estimated effort:** 8-12 weeks (can be deferred)

**Defer if:** MariaDB is not a real pain point, 389 DS write performance is
insufficient, or Phases 1-2 meet all operational needs.

---

## 7. Component Ownership Matrix

| Component | Language | Upstream Project | Contribution Strategy |
|-----------|----------|------------------|----------------------|
| SPIRE UpstreamAuthority plugin | Go | SPIFFE/SPIRE | Contribute as external plugin to spiffe/spire-plugin-sdk examples or maintain under dogtagpki org |
| Fulcio Dogtag CA backend | Go | Sigstore/Fulcio | Contribute upstream alongside existing googleca/kmsca/pkcs11ca backends |
| Dogtag OIDC auth plugin | Java | Dogtag PKI | Contribute upstream as new authentication module |
| Dogtag code-signing profile | Config | Dogtag PKI | Documentation and example profile; no code contribution needed |
| 389 DS transparency log plugin | C/Rust | 389 DS | Contribute as optional plugin (similar to DNA plugin for unique IDs) |
| WebUI SPIRE/Sigstore pages | TypeScript | dogtag-webui | This repository; upstream when WebUI itself is upstreamed |

SPIRE actively encourages external UpstreamAuthority plugins (`aws_pca`,
`vault`, `cert-manager` exist). Fulcio has accepted multiple CA backends but
a Dogtag backend would be the first on-premises enterprise CA. The Dogtag OIDC
auth plugin requires early maintainer engagement. The 389 DS transparency log
plugin needs a proof-of-concept before proposing upstream.

---

## 8. Risk Assessment

| Phase | Risk | L / I | Mitigation |
|-------|------|-------|------------|
| 1 | Dogtag REST API missing JSON enrollment endpoints | M/M | Fall back to XML API; document gaps for upstream |
| 1 | mTLS config complexity in containers | M/L | Quadlet examples with volume mounts; automate cert provisioning |
| 1 | SPIRE plugin SDK breaking changes | L/M | Pin SDK version; CI against SPIRE nightly |
| 2 | Client-side SAN filtering does not scale past thousands of certs | H/M | Pagination + caching; plan server-side SAN search upstream |
| 2 | PrettyPrint parsing fragile across Dogtag versions | M/M | Version-specific tests; prefer structured API fields |
| 3 | Dogtag upstream rejects OIDC auth plugin | M/H | Engage maintainers early; maintain independently if needed |
| 3 | OIDC edge cases (clock skew, issuer quirks) | M/M | Mature Java library (Nimbus JOSE+JWT); comprehensive test matrix |
| 3 | cosign requires Fulcio-specific API contract | L/M | Verify cosign accepts certs from arbitrary CAs |
| 4 | 389 DS write performance insufficient | H/H | Benchmark early; abandon if throughput inadequate |
| 4 | LDAP replication conflicts on concurrent appends | H/H | Single-supplier writes for sigstore suffix; replicas read-only |
| 4 | Rekor API compat surface larger than estimated | M/H | Start with Trillian storage plugin, not full replacement |
| All | Upstream direction changes (SPIRE v2, Sigstore shifts) | L/H | API bridges isolate Dogtag; plugins are versioned |
| All | Security vulnerability in custom integration code | M/H | Security review for all plugins; least-privilege throughout |
| All | Maintenance burden across 6 components in 4 languages | M/M | Prioritize high-value phases; defer Phase 4 if capacity constrained |

Key: L = Likelihood, I = Impact. L/M/H = Low/Medium/High.

---

## 9. Decision Matrix

| Factor | Embed as Subsystem | API Bridge | Capability Absorption |
|--------|-------------------|------------|----------------------|
| Development effort | Very high (rewrite in Java) | Low-medium (Go plugins) | Medium-high (Java plugin) |
| Maintenance burden | Unsustainable (permanent fork) | Low (versioned plugin API) | Medium (upstream contribution) |
| Operational simplicity | One system (but enormous) | Multiple containers | Fewer containers |
| Upstream alignment | Divergent (fork) | Compatible (plugin ecosystem) | Complementary (extends Dogtag) |
| Time to value | 6-12 months | 2-4 weeks | 3-6 months |
| Key protection | Shared NSS (good) | Dogtag REST API (good) | Dogtag NSS/HSM (good) |
| Audit trail | Unified (good) | Unified via Dogtag enrollment | Unified (best) |
| Flexibility | Locked to Dogtag releases | Independent release cycles | Dogtag release + optional Fulcio |
| Scalability | Single JVM limits | Independent scaling per service | CA-limited (Dogtag throughput) |
| Risk | Highest (rewrite, fork, coupling) | Lowest (reversible, incremental) | Medium (upstream acceptance) |

**The API bridge approach dominates on risk-adjusted value.** Core benefits in
weeks, not months. Capability absorption is the correct long-term play for
Fulcio but should be pursued *after* the API bridge is operational.

---

## 10. Recommendation

**Start with API bridges, then selectively absorb and consolidate.**

1. **Weeks 1-4:** SPIRE UpstreamAuthority plugin + Fulcio Dogtag backend.
   Single trust root, HSM keys, audit trail. Minimal risk.
2. **Weeks 3-6:** WebUI visibility pages. Unified operational view.
3. **Weeks 6-14:** Dogtag OIDC auth plugin. Fulcio becomes optional.
4. **Weeks 10-20 (deferrable):** 389 DS transparency log. Gate on benchmarks.

**SPIRE stays separate permanently** -- attestation is its value; Dogtag
provides CA signing. **Fulcio transitions from required to optional** --
Phase 1 makes it a thin client, Phase 3 makes it unnecessary for basic
flows. **Rekor's infrastructure simplifies if justified** -- if 389 DS
cannot sustain the write workload, MariaDB-backed Trillian remains functional.
