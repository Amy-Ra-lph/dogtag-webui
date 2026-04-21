# Design: Dogtag PKI as Fulcio CA Backend

**Status:** Draft
**Date:** 2026-04-20
**Author:** Amy Farley

## Problem Statement

The ipa-oauth2-plugin PoC currently deploys Fulcio with the `fileca` backend.
Fulcio's intermediate CA key is a passphrase-encrypted PEM file mounted into a
UBI 9 container. While functional for a PoC, this approach has significant
limitations for production use:

1. **No HSM protection.** The CA private key exists as a file on disk. Anyone
   with filesystem access (root, container escape, backup exfiltration) can
   extract it. The passphrase is passed via environment variable and visible in
   `/proc/<pid>/cmdline` unless `hidepid=2` is set.

2. **Manual key rotation.** Rotating the intermediate CA key requires
   generating a new keypair, submitting a CSR to IPA Dogtag via
   `ipa cert-request`, updating the container volume mounts, and restarting
   Fulcio. There is no automated rotation mechanism.

3. **No CA-level audit trail.** When Fulcio signs a certificate using `fileca`,
   the signing operation happens entirely in-process. Dogtag has no record of
   the certificate being issued. The only audit evidence is Fulcio's own logs
   and the Rekor transparency log entry.

4. **No certificate lifecycle management.** Certificates issued by `fileca` are
   not tracked in any CA database. There is no revocation capability, no serial
   number management by the CA, and no integration with IPA's certificate
   tracking infrastructure.

5. **Disconnected trust chain.** Although the Fulcio intermediate was signed by
   IPA's Dogtag root CA, Dogtag is unaware of certificates issued under that
   intermediate. The trust relationship is one-way.

## Goals

- Issue Fulcio code-signing certificates through Dogtag PKI so that every
  certificate appears in Dogtag's audit log and certificate database.
- Protect the CA signing key with HSM or NSS database rather than PEM files.
- Maintain Fulcio's sub-second signing latency for interactive `cosign` flows.
- Preserve compatibility with the existing Sigstore stack (cosign, Rekor,
  Keycloak OIDC issuer).
- Minimize changes to upstream Fulcio code.

## Non-Goals

- Replacing Rekor or the transparency log (that is a separate effort; see
  "Transparency Log Integration" below).
- Supporting non-IPA Dogtag deployments. This design assumes Dogtag is managed
  by FreeIPA.
- Implementing certificate revocation for short-lived code-signing certs.
  Fulcio certificates have 10-20 minute validity; revocation is unnecessary
  when the transparency log provides non-repudiation.
- Multi-tenancy or multi-CA routing within Fulcio.

## Architecture Overview

```
cosign client
    |
    | 1. OIDC token + public key
    v
+---------+     2. CSR (or local sign)     +-----------+
| Fulcio  | -----------------------------> | Dogtag CA |
| (Go)    | <----------------------------- | (Java)    |
+---------+     3. Signed certificate      +-----------+
    |                                           |
    | 4. Submit to                              | audit log
    |    transparency log                       | cert DB
    v                                           v
+---------+                              +----------+
| Rekor   |                              | 389 DS   |
+---------+                              +----------+
```

Two implementation approaches are evaluated below. They differ in where the
signing operation occurs and what Fulcio interface they use.

## Approach A: Native Dogtag CA Backend

### Description

Implement a new Go CA backend (`dogtagca`) for Fulcio that calls Dogtag's REST
API to submit a PKCS#10 CSR and retrieve the signed certificate. Fulcio
constructs the CSR from the OIDC-validated identity and the caller's public
key, then delegates all signing to Dogtag.

### Fulcio CA Interface

The Fulcio CA backend interface (from `pkg/ca/ca.go`):

```go
type CertificateAuthority interface {
    CreateCertificate(ctx context.Context, challenge *challenges.ChallengeResult) (*CodeSigningCertificate, error)
    Root(ctx context.Context) ([]byte, error)
    Close() error
}
```

The `dogtagca` backend would:

1. Build a CSR from the challenge result (subject, public key, SANs).
2. POST the CSR to Dogtag's enrollment endpoint.
3. Parse the signed certificate from the response.
4. Return the certificate and the CA chain.

### Dogtag REST API Flow

```
POST /ca/rest/certrequests
Content-Type: application/json
Authorization: (client cert via mTLS)

{
  "ProfileID": "fulcioCodeSigning",
  "Input": [
    {
      "id": "i1",
      "ClassID": "certReqInputImpl",
      "Attribute": [
        {
          "name": "cert_request_type",
          "Value": "pkcs10"
        },
        {
          "name": "cert_request",
          "Value": "<base64-encoded-CSR>"
        }
      ]
    }
  ]
}
```

Response includes the certificate in PEM format under the `Output` array.
For an auto-approved profile, the certificate is returned in the same
request. For manual-approval profiles, a second GET to
`/ca/rest/certrequests/<requestID>` is needed after approval.

### Backend Implementation Sketch

```go
package dogtagca

import (
    "context"
    "crypto/tls"
    "crypto/x509"
    "encoding/pem"
    "fmt"
    "net/http"

    "github.com/sigstore/fulcio/pkg/ca"
    "github.com/sigstore/fulcio/pkg/challenges"
)

type DogtagCA struct {
    client    *http.Client
    baseURL   string
    profileID string
    rootCert  *x509.Certificate
    certChain []*x509.Certificate
}

type DogtagConfig struct {
    BaseURL    string `json:"base_url"`    // e.g. "https://idm1.test.example.com:8443"
    ProfileID  string `json:"profile_id"`  // e.g. "fulcioCodeSigning"
    ClientCert string `json:"client_cert"` // path to PEM client cert
    ClientKey  string `json:"client_key"`  // path to PEM client key
    CACert     string `json:"ca_cert"`     // path to Dogtag CA cert for TLS verification
}

func NewDogtagCA(cfg DogtagConfig) (*DogtagCA, error) {
    clientCert, err := tls.LoadX509KeyPair(cfg.ClientCert, cfg.ClientKey)
    if err != nil {
        return nil, fmt.Errorf("loading client cert: %w", err)
    }

    caCertPool := x509.NewCertPool()
    // ... load cfg.CACert into pool ...

    httpClient := &http.Client{
        Transport: &http.Transport{
            TLSClientConfig: &tls.Config{
                Certificates: []tls.Certificate{clientCert},
                RootCAs:      caCertPool,
            },
        },
    }

    return &DogtagCA{
        client:    httpClient,
        baseURL:   cfg.BaseURL,
        profileID: cfg.ProfileID,
    }, nil
}

func (d *DogtagCA) CreateCertificate(ctx context.Context,
    challenge *challenges.ChallengeResult) (*ca.CodeSigningCertificate, error) {
    // 1. Build CSR from challenge.PublicKey with SANs from challenge
    // 2. POST to /ca/rest/certrequests with profileID=fulcioCodeSigning
    // 3. Parse certificate from response
    // 4. Return CodeSigningCertificate with cert + chain
    return nil, nil // placeholder
}
```

### Pros

- Full audit trail: every certificate issuance is recorded in Dogtag's
  `ca_audit` log and certificate database.
- Key never leaves Dogtag (or its HSM). Fulcio has no access to the CA key.
- Certificate serial numbers managed by Dogtag.
- Natural integration with IPA's certificate tracking (`ipa cert-find`).
- Dogtag profile enforces certificate policy server-side.

### Cons

- Adds network round-trip latency per signing operation (~5-50ms LAN).
- Requires a custom Fulcio backend (new Go code, not yet upstream).
- Dogtag must handle the signing throughput.
- Profile must be configured for auto-approval to avoid blocking.

## Approach B: PKCS#11 Backend with Dogtag's NSS/HSM

### Description

Use Fulcio's existing `pkcs11ca` backend, pointing it at the same PKCS#11
token (NSS database or hardware HSM) that Dogtag uses for its CA signing key.
Fulcio signs certificates locally using the PKCS#11 interface, but the key
material is protected by the HSM/NSS token.

### Configuration

Fulcio's `pkcs11ca` requires a PKCS#11 configuration:

```json
{
  "ca": "pkcs11ca",
  "PKCS11Config": {
    "Path": "/usr/lib64/pkcs11/libsofthsm2.so",
    "TokenLabel": "fulcio-ca",
    "Pin": "1234"
  }
}
```

For Dogtag's NSS database, the PKCS#11 module is `libnsspem.so` or the
SoftHSM2 library if Dogtag is configured with SoftHSM.

### Critical Limitation

The official Fulcio binary (from `ghcr.io/sigstore/fulcio:v1.6.6`) is built
**without CGo**. The `pkcs11ca` backend requires CGo for the PKCS#11 C
bindings (`miekg/pkcs11`). This means `pkcs11ca` fails at runtime with the
stock binary. Using this approach requires building Fulcio from source with
`CGO_ENABLED=1` and the PKCS#11 development headers.

### Pros

- Uses an existing upstream Fulcio backend (no new Go code).
- Local signing: no network latency per operation.
- Key protected by HSM/NSS token.

### Cons

- **No audit trail in Dogtag.** Fulcio signs directly via PKCS#11; Dogtag is
  bypassed entirely and has no record of issued certificates.
- Requires building Fulcio from source with CGo (adds build complexity, loses
  distroless compatibility).
- Shared PKCS#11 token between Dogtag and Fulcio creates contention risk and
  requires careful access control.
- No certificate database: same gap as `fileca` for lifecycle management.
- Fulcio must construct the full certificate (extensions, serial, validity)
  itself rather than delegating to the CA profile.

### Recommendation

**Approach A (native Dogtag backend)** is recommended. The audit trail and
certificate database integration are essential for enterprise PKI. The latency
cost is acceptable for code-signing workloads (interactive `cosign sign` flows
already take 1-3 seconds due to OIDC token acquisition and Rekor submission).
The CGo build requirement of Approach B introduces fragility with no
compensating benefit beyond eliminating a LAN round-trip.

## Dogtag Certificate Profile: `fulcioCodeSigning`

A custom Dogtag profile is required to issue short-lived code-signing
certificates with the correct extensions.

### Profile Configuration

```ini
# /var/lib/pki/pki-tomcat/ca/profiles/ca/fulcioCodeSigning.cfg

desc=Short-lived code signing certificate for Sigstore Fulcio
visible=false
enable=true
auth.instance_id=raCertAuth

# Auto-approve (no agent approval needed)
policyset.serverCertSet.list=1,2,3,4,5,6,7

# 1. Subject Name — constructed by Fulcio, passed in CSR
policyset.serverCertSet.1.constraint.class_id=subjectNameConstraintImpl
policyset.serverCertSet.1.constraint.name=Subject Name Constraint
policyset.serverCertSet.1.default.class_id=userSubjectNameDefaultImpl
policyset.serverCertSet.1.default.name=Subject Name Default

# 2. Validity — 20 minutes
policyset.serverCertSet.2.constraint.class_id=validityConstraintImpl
policyset.serverCertSet.2.constraint.name=Validity Constraint
policyset.serverCertSet.2.constraint.params.range=20
policyset.serverCertSet.2.constraint.params.notBeforeGracePeriod=5
policyset.serverCertSet.2.default.class_id=validityDefaultImpl
policyset.serverCertSet.2.default.name=Validity Default
policyset.serverCertSet.2.default.params.range=20
policyset.serverCertSet.2.default.params.rangeUnit=minute

# 3. Key Usage — digital signature only
policyset.serverCertSet.3.constraint.class_id=keyUsageExtConstraintImpl
policyset.serverCertSet.3.default.class_id=keyUsageExtDefaultImpl
policyset.serverCertSet.3.default.params.keyUsageCritical=true
policyset.serverCertSet.3.default.params.keyUsageDigitalSignature=true
policyset.serverCertSet.3.default.params.keyUsageNonRepudiation=false
policyset.serverCertSet.3.default.params.keyUsageKeyEncipherment=false

# 4. Extended Key Usage — code signing
policyset.serverCertSet.4.constraint.class_id=noConstraintImpl
policyset.serverCertSet.4.default.class_id=extendedKeyUsageExtDefaultImpl
policyset.serverCertSet.4.default.params.exKeyUsageCritical=false
policyset.serverCertSet.4.default.params.exKeyUsageOIDs=1.3.6.1.5.5.7.3.3

# 5. Authority Key Identifier
policyset.serverCertSet.5.constraint.class_id=noConstraintImpl
policyset.serverCertSet.5.default.class_id=authorityKeyIdentifierExtDefaultImpl

# 6. Subject Key Identifier
policyset.serverCertSet.6.constraint.class_id=noConstraintImpl
policyset.serverCertSet.6.default.class_id=subjectKeyIdentifierExtDefaultImpl

# 7. No key archival
policyset.serverCertSet.7.constraint.class_id=noConstraintImpl
policyset.serverCertSet.7.default.class_id=noDefaultImpl

input.list=i1
input.i1.class_id=certReqInputImpl
output.list=o1
output.o1.class_id=certOutputImpl
```

### Key Properties

| Property | Value | Rationale |
|----------|-------|-----------|
| Validity | 20 minutes | Matches Fulcio convention. Long enough for signing + Rekor submission |
| EKU | 1.3.6.1.5.5.7.3.3 (codeSigning) | Required by cosign for signature verification |
| Key Usage | digitalSignature only | Code signing does not need keyEncipherment |
| Auth | raCertAuth (agent cert) | Fulcio authenticates via client certificate |
| Approval | Auto (no agent queue) | Fulcio requires synchronous cert issuance |
| Key Archival | Disabled | Ephemeral keys; archival adds latency and has no value |

### SAN Handling

Fulcio embeds the OIDC subject (email or SPIFFE ID) in the certificate's
Subject Alternative Name extension. The CSR submitted to Dogtag must include
the SAN, and the profile must allow pass-through of SAN values from the
request. Add a SAN extension policy if the default profile strips SANs:

```ini
# Allow SAN from CSR
policyset.serverCertSet.8.constraint.class_id=noConstraintImpl
policyset.serverCertSet.8.default.class_id=subjectAltNameExtDefaultImpl
policyset.serverCertSet.8.default.params.subjAltExtGNEnable_0=true
policyset.serverCertSet.8.default.params.subjAltExtType_0=RFC822Name
policyset.serverCertSet.8.default.params.subjAltExtSource_0=request
```

### Profile Registration

```bash
# Add the profile to Dogtag
pki -n "PKI Administrator" ca-profile-add \
    /var/lib/pki/pki-tomcat/ca/profiles/ca/fulcioCodeSigning.cfg

# Enable it
pki -n "PKI Administrator" ca-profile-enable fulcioCodeSigning
```

## Authentication: Fulcio to Dogtag

Dogtag authenticates REST API clients via client certificates (mTLS). Fulcio
needs an agent-level certificate to submit enrollment requests.

### Agent Certificate for Fulcio

```bash
# Generate key and CSR for the Fulcio agent
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 \
    -out /etc/ipa/fulcio/agent-key.pem

openssl req -new -key /etc/ipa/fulcio/agent-key.pem \
    -out /tmp/fulcio-agent.csr \
    -subj "/CN=fulcio-agent/O=TEST.EXAMPLE.COM"

# Issue via IPA and add to Dogtag's agent group
ipa cert-request /tmp/fulcio-agent.csr \
    --principal=host/idm1.test.example.com \
    --profile=caIPAserviceCert

# Import into Dogtag's NSS database and assign agent privileges
pki -n "PKI Administrator" ca-agent-cert-add <serial>
```

### Least Privilege

The Fulcio agent certificate should have the minimum privileges needed:

- **Can enroll** certificates using the `fulcioCodeSigning` profile.
- **Cannot approve** other certificate requests.
- **Cannot modify** CA configuration or profiles.
- **Cannot access** key archival or recovery.

Dogtag supports ACLs on profile-level enrollment. Restrict the agent to
only the `fulcioCodeSigning` profile.

## Performance Considerations

### Latency Budget

A typical `cosign sign-blob` flow:

| Step | Duration | Notes |
|------|----------|-------|
| OIDC token acquisition | 500-2000ms | Device flow or browser redirect |
| Fulcio cert issuance | 10-100ms | **This is the step affected** |
| Rekor transparency log | 50-200ms | HTTP POST to Rekor API |
| **Total** | **560-2300ms** | Interactive signing is already multi-second |

With `fileca`, cert issuance is ~1ms (in-process RSA sign). With the Dogtag
REST API (Approach A), expect 10-50ms on a LAN (TLS handshake + CSR
processing + cert generation). This is within the noise of the overall flow.

### Throughput

Dogtag is designed for enterprise PKI workloads (SCEP, CMP, EST). A single
Dogtag instance can handle hundreds of certificate requests per second. For
code-signing use cases in a development team (10-100 signings per day), Dogtag
is vastly over-provisioned.

For CI/CD pipelines with high-volume automated signing (thousands of
artifacts per build), the per-request overhead of Approach A may become
relevant. In that scenario, connection pooling and HTTP keep-alive on the
Fulcio-to-Dogtag link are essential. Batch signing (multiple certs per API
call) is not supported by Dogtag's enrollment API.

## Transparency Log Integration

This design does not change how Fulcio interacts with Rekor. The signed
certificate (whether from `fileca`, `dogtagca`, or `pkcs11ca`) is submitted
to Rekor identically. The transparency log records the certificate, signature,
and artifact hash.

### Current Stack

```
Fulcio -> Rekor -> Trillian log_server -> MariaDB (on idm2)
                   Trillian log_signer (singleton on idm1)
```

### Future: 389 DS as Trillian Backend

A separate effort is exploring replacing Trillian + MariaDB with a custom
transparency log backed by 389 DS (LDAP). Merkle tree entries would be stored
under a separate LDAP suffix (e.g., `o=sigstore`), similar to how Dogtag uses
`o=ipaca`. IPA multi-supplier replication would replicate the log to all IPA
replicas automatically, eliminating MariaDB as a dependency.

Key challenges for the LDAP backend:
- Sequential leaf numbering without SQL `AUTO_INCREMENT`.
- Tree head updates without ACID transactions.
- Write-heavy append workload on a read-optimized directory server.

The Dogtag CA backend design is independent of the transparency log backend.
Both can proceed in parallel.

## Security Considerations

### Key Protection

| Approach | Key Location | Protection |
|----------|-------------|------------|
| Current (`fileca`) | PEM file in container volume | Passphrase (env var) |
| Approach A (`dogtagca`) | Dogtag's NSS DB or HSM | NSS token PIN or HSM |
| Approach B (`pkcs11ca`) | Shared PKCS#11 token | HSM PIN |

Approach A provides the strongest posture: the key never leaves Dogtag's
process boundary. Even if the Fulcio container is compromised, the attacker
cannot extract the CA key. They could submit CSRs via the REST API, but
the agent certificate can be revoked to stop further issuance.

### Audit Trail

With Approach A, Dogtag records every certificate issuance in:
- `ca_audit` log (signed, tamper-evident).
- Certificate database (searchable via `pki ca-cert-find`).
- LDAP (`ou=certificateRepository,o=ipaca`).

Combined with Rekor's transparency log, this provides two independent,
append-only records of every code-signing event.

### Least Privilege

The Fulcio agent certificate should be scoped to:
- A single Dogtag profile (`fulcioCodeSigning`).
- Enrollment operations only (no approval, no admin).
- Network access restricted to the Dogtag HTTPS port (8443).

### Container Security

The Fulcio container no longer needs the CA private key mounted. The only
secrets are:
- The agent client certificate and key (for mTLS to Dogtag).
- The Dogtag CA certificate (for TLS verification, not secret).

This significantly reduces the blast radius of a container compromise compared
to the current `fileca` setup where the full CA key is mounted.

## Configuration

### Fulcio Config (Approach A)

```json
{
  "OIDCIssuers": {
    "http://idm1.test.example.com:8180/auth/realms/ipa": {
      "IssuerURL": "http://idm1.test.example.com:8180/auth/realms/ipa",
      "ClientID": "sigstore",
      "Type": "email"
    }
  },
  "ca": "dogtagca",
  "DogtagConfig": {
    "base_url": "https://idm1.test.example.com:8443",
    "profile_id": "fulcioCodeSigning",
    "client_cert": "/etc/fulcio-config/agent-cert.pem",
    "client_key": "/etc/fulcio-config/agent-key.pem",
    "ca_cert": "/etc/fulcio-config/ca-cert.pem"
  }
}
```

### Updated Containerfile

```dockerfile
FROM registry.access.redhat.com/ubi9/ubi-minimal:latest

RUN microdnf install -y shadow-utils && microdnf clean all && \
    useradd -r -s /sbin/nologin -d /etc/fulcio-config fulcio

COPY fulcio /usr/local/bin/fulcio
RUN chmod 755 /usr/local/bin/fulcio

# No CA key needed — only the agent cert for mTLS to Dogtag
RUN mkdir -p /etc/fulcio-config && chown fulcio:fulcio /etc/fulcio-config

USER fulcio
EXPOSE 8080 8081
ENTRYPOINT ["/usr/local/bin/fulcio", "serve"]
```

### Updated Quadlet

```ini
[Container]
Image=localhost/fulcio:ubi9-dogtag
PublishPort=5555:8080
PublishPort=5556:8081
Volume=/etc/ipa/fulcio/agent-cert.pem:/etc/fulcio-config/agent-cert.pem:ro,z
Volume=/etc/ipa/fulcio/agent-key.pem:/etc/fulcio-config/agent-key.pem:ro,z
Volume=/etc/ipa/fulcio/ca-cert.pem:/etc/fulcio-config/ca-cert.pem:ro,z
Volume=/etc/ipa/fulcio/fulcio-config.json:/etc/fulcio-config/config.json:ro,z

[Service]
Restart=always

[Install]
WantedBy=multi-user.target
```

Note: the `FULCIO_CA_PASSPHRASE` environment variable and passphrase-handling
startup script are no longer needed since the CA key is not present in the
container.

## Effort Estimate

| Task | Effort | Notes |
|------|--------|-------|
| Dogtag profile creation + testing | 1-2 days | Profile config, SAN pass-through, auto-approval verification |
| Go backend implementation | 3-5 days | CSR construction, REST client, mTLS, error handling, tests |
| Agent certificate provisioning | 0.5 day | Generate, issue, assign Dogtag agent role |
| Integration testing | 2-3 days | End-to-end cosign sign/verify, Rekor interaction, error scenarios |
| Fulcio config + container updates | 0.5 day | New config schema, updated Containerfile/Quadlet |
| Documentation | 1 day | Admin guide updates, profile reference |
| **Total** | **8-12 days** | |

Upstream contribution (getting `dogtagca` into Fulcio's codebase) would
require additional effort for code review, CI integration, and community
engagement. The initial implementation can live in the ipa-oauth2-plugin
repo as a fork or plugin.

## Open Questions

1. **Upstream acceptance.** Would the Sigstore/Fulcio project accept a Dogtag
   CA backend? The existing backends (`googleca`, `kmsca`, `pkcs11ca`) suggest
   openness to multiple CA integrations, but Dogtag is niche compared to cloud
   KMS providers.

2. **Profile SAN flexibility.** Dogtag profiles are rigid about SAN types.
   Fulcio may need to embed URIs (SPIFFE IDs), emails, or other SAN types
   depending on the OIDC issuer. The profile must handle all SAN types that
   Fulcio supports, or multiple profiles may be needed.

3. **Dogtag on a different host.** In FreeIPA, Dogtag runs on the IPA server
   (port 8443). If Fulcio runs on a different host, the mTLS connection
   crosses the network. TLS is already required (Dogtag mandates HTTPS), but
   network partitioning could cause signing failures.

4. **Certificate validity enforcement.** Should the Dogtag profile enforce
   the 20-minute validity, or should Fulcio specify the validity in the CSR
   and Dogtag accept it? Profile enforcement is safer (prevents a compromised
   Fulcio from requesting long-lived certs), but less flexible.

5. **Serial number format.** Dogtag uses sequential serial numbers by default.
   Fulcio expects random serial numbers (per CA/Browser Forum ballot SC-62).
   Dogtag supports random serial numbers via `dbs.enableRandomSerialNumbers`
   in `CS.cfg`. Verify this works with the enrollment API.

6. **IPA cert-request vs raw Dogtag API.** An alternative to calling the
   Dogtag REST API directly is using IPA's `cert-request` command (which
   wraps Dogtag). This would route through IPA's RBAC and audit, but adds
   another network hop and the overhead of IPA's XML-RPC layer. For
   performance-sensitive code signing, the direct Dogtag REST API is preferred.

7. **Relationship to Dogtag WebUI.** The dogtag-webui project provides a
   React/PatternFly interface for Dogtag administration. A
   `fulcioCodeSigning` profile could be managed through the WebUI once
   profile management pages are implemented. The agent certificate lifecycle
   (issuance, renewal, revocation) would also benefit from WebUI visibility.
