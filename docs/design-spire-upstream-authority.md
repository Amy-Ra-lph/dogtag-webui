# Design: SPIRE UpstreamAuthority Plugin for Dogtag PKI

**Status:** Draft
**Date:** 2026-04-20
**Author:** Amy Farley

---

## 1. Problem Statement

Both the `ipa-oauth2-plugin` and `workload-identity-poc` projects currently use SPIRE's
built-in `UpstreamAuthority "disk"` plugin. This requires a static CA certificate and
private key pair at `/opt/spire/conf/server/upstream-ca.{crt,key}`, generated manually
with `openssl` during deployment:

```bash
openssl genrsa -out /opt/spire/conf/server/upstream-ca.key 4096
openssl req -new -x509 \
    -key /opt/spire/conf/server/upstream-ca.key \
    -out /opt/spire/conf/server/upstream-ca.crt \
    -days 365 \
    -subj "/O=TEST.EXAMPLE.COM/CN=SPIRE Intermediate CA" \
    -addext "basicConstraints=critical,CA:TRUE,pathlen:1" \
    -addext "keyUsage=critical,keyCertSign,cRLSign"
```

This approach is inadequate for production for three reasons:

1. **No automated rotation.** The CA certificate is generated once with a fixed
   365-day validity. When it expires, SPIRE stops issuing SVIDs. There is no
   renewal mechanism -- an operator must manually regenerate the key pair and
   restart the SPIRE server.

2. **Key exposure risk.** The CA private key sits on the filesystem in PEM format
   (`chmod 600`). Any process running as root on the SPIRE server host can read it.
   There is no HSM backing, no audit trail for key usage, and no revocation path
   if the key is compromised.

3. **No trust chain to the IPA CA.** The self-signed intermediate is not chained
   under FreeIPA's Dogtag CA. Workload certificates issued by SPIRE are not
   verifiable against the organization's existing PKI trust root. This breaks
   certificate validation for any service that trusts only the IPA CA hierarchy.

A native SPIRE UpstreamAuthority plugin that integrates with Dogtag PKI eliminates
all three problems by delegating CA signing to the existing IPA infrastructure.

## 2. Goals and Non-Goals

### Goals

- Implement a SPIRE UpstreamAuthority plugin that obtains intermediate CA certificates
  from Dogtag PKI, chained under the IPA CA.
- Support automated certificate rotation before expiry, driven by SPIRE's `ca_ttl`
  configuration.
- Authenticate to Dogtag using client certificates (mTLS), consistent with IPA's
  security model.
- Work with both standalone Dogtag and IPA-managed Dogtag deployments.
- Publish JWT signing keys upstream (satisfy `PublishJWTKeyAndSubscribe`).

### Non-Goals

- HSM integration for the SPIRE server's own key material (SPIRE's KeyManager
  plugin is a separate concern).
- Support for non-IPA certificate authorities (EJBCA, Step CA, etc.).
- Multi-tenancy or multi-realm support in the initial version.
- Running SPIRE inside a FreeIPA container -- SPIRE remains a separate service.

## 3. Architecture

```
                    +------------------+
                    |   Dogtag CA      |
                    |  (IPA-managed)   |
                    |                  |
                    |  REST API:       |
                    |  /ca/rest/...    |
                    +--------+---------+
                             |
                             | mTLS (client cert auth)
                             |
                    +--------+---------+
                    |  UpstreamAuthority|
                    |  "dogtag" plugin  |
                    +--------+---------+
                             |
                    +--------+---------+
                    |   SPIRE Server   |
                    |                  |
                    |  Mints X.509     |
                    |  SVIDs using     |
                    |  Dogtag-signed   |
                    |  intermediate CA |
                    +--------+---------+
                             |
              +--------------+--------------+
              |                             |
     +--------+--------+          +--------+--------+
     |  SPIRE Agent 1  |          |  SPIRE Agent N  |
     |  (workload host) |          |  (workload host) |
     +-----------------+          +-----------------+
```

**Certificate chain:**

```
IPA Root CA (Dogtag)
  └── SPIRE Intermediate CA (issued by Dogtag via plugin)
        └── SPIRE Server CA (minted by SPIRE internally)
              └── Workload X.509 SVID (issued to workloads)
```

The plugin sits inside the SPIRE server process. When SPIRE needs a new
intermediate CA certificate (at startup or before the current one expires),
the plugin generates a CSR, submits it to Dogtag, retrieves the signed
certificate, and returns it to SPIRE along with the upstream CA chain.

## 4. Plugin Interface

SPIRE's UpstreamAuthority plugin interface is defined in the
`github.com/spiffe/spire-plugin-sdk` module. The plugin must implement two RPCs:

```go
// UpstreamAuthorityServer is the interface a plugin must implement.
type UpstreamAuthorityServer interface {
    // MintX509CAAndSubscribe is called by the SPIRE server to obtain
    // a signed intermediate CA certificate. The plugin receives a CSR
    // and returns the signed certificate plus the upstream trust bundle.
    // The stream remains open so the plugin can push updated bundles
    // (e.g., after CA rotation upstream).
    MintX509CAAndSubscribe(
        *upstreamauthorityv1.MintX509CAAndSubscribeRequest,
        upstreamauthorityv1.UpstreamAuthority_MintX509CAAndSubscribeServer,
    ) error

    // PublishJWTKeyAndSubscribe publishes a JWT signing key to the
    // upstream authority. For Dogtag, this is a no-op since Dogtag
    // does not manage JWT keys, but the method must still be implemented.
    PublishJWTKeyAndSubscribe(
        *upstreamauthorityv1.PublishJWTKeyAndSubscribeRequest,
        upstreamauthorityv1.UpstreamAuthority_PublishJWTKeyAndSubscribeServer,
    ) error
}
```

### MintX509CAAndSubscribe flow

1. SPIRE calls `MintX509CAAndSubscribe` with a `csr` field (DER-encoded PKCS#10).
2. The plugin submits the CSR to Dogtag via the REST API or IPA CLI.
3. Dogtag signs the CSR using the configured certificate profile and returns
   the signed certificate.
4. The plugin sends the first response on the stream:
   - `x509_ca_chain`: the signed intermediate CA cert + Dogtag CA cert (PEM)
   - `upstream_x509_roots`: the IPA root CA certificate (PEM)
5. The plugin keeps the stream open. Before the intermediate CA expires, it
   re-submits a new CSR and sends an updated response on the stream.

### PublishJWTKeyAndSubscribe flow

Dogtag PKI does not manage JWT signing keys. The plugin returns an
`Unimplemented` error or simply acknowledges the key without publishing
it upstream. This is the same approach used by the `aws_pca` and `vault`
upstream authority plugins.

## 5. Authentication

Dogtag authenticates API clients via client certificates (mTLS). The plugin
needs a client certificate and private key that Dogtag trusts.

### Option 1: Dedicated agent certificate (recommended)

Create a lightweight RA (Registration Authority) agent in Dogtag with
permissions limited to certificate enrollment in a specific profile:

```bash
# On the IPA server, create a service principal for SPIRE
ipa service-add spire/spire-server.example.com

# Request a client certificate for the service
ipa cert-request spire-server.csr \
    --principal=spire/spire-server.example.com \
    --profile-id=caIPAserviceCert
```

The resulting certificate and key are provided to the plugin via configuration.

### Option 2: IPA host certificate

Use the SPIRE server host's existing IPA host certificate (issued during
`ipa-client-install`). This certificate lives in `/etc/ipa/` and is already
trusted by Dogtag. Less setup, but the host cert may lack the permissions
needed for CA enrollment operations.

### Option 3: Kerberos + certmonger

Delegate certificate management to `certmonger`, which handles Kerberos
authentication to IPA and automatic renewal. The plugin reads the certificate
files that certmonger maintains. See Approach B in Section 8.

## 6. Certificate Lifecycle

### TTL alignment

Three TTL values must be coordinated:

| Parameter | Default | Description |
|-----------|---------|-------------|
| SPIRE `ca_ttl` | 24h | How long SPIRE's intermediate CA is valid |
| Dogtag profile validity | varies | Max validity the Dogtag profile allows |
| SPIRE `default_x509_svid_ttl` | 1h | Workload certificate TTL |

The Dogtag certificate profile must allow validity periods at least as long as
SPIRE's `ca_ttl`. If `ca_ttl` is 24h, the Dogtag profile should allow at least
48h to provide a rotation window.

### Rotation sequence

1. At `T = 0`, the plugin requests an intermediate CA cert valid for `ca_ttl`.
2. At `T = ca_ttl / 2` (the preparedness threshold), SPIRE calls
   `MintX509CAAndSubscribe` again with a fresh CSR.
3. The plugin submits the new CSR to Dogtag, receives a new intermediate CA
   cert, and sends it on the open stream.
4. SPIRE begins using the new intermediate CA for signing while the old one
   is still valid (graceful rollover).
5. Workloads holding SVIDs signed by the old intermediate CA continue to
   validate until those SVIDs expire (bounded by `default_x509_svid_ttl`).

### Dogtag certificate profile

A custom Dogtag profile (`caSpireIntermediateCA`) should be created with:

- `basicConstraints`: `CA:TRUE, pathlen:1`
- `keyUsage`: `keyCertSign, cRLSign`
- `validityDefault`: configurable, suggested 48h-30d depending on environment
- Auto-approval enabled (no manual agent approval step)

```bash
# Create the profile on the IPA server
ipa certprofile-import caSpireIntermediateCA \
    --file=caSpireIntermediateCA.cfg \
    --desc="SPIRE Intermediate CA" \
    --store=true
```

## 7. Configuration

### SPIRE server.conf

```hcl
plugins {
    UpstreamAuthority "dogtag" {
        plugin_data {
            # Dogtag CA REST API endpoint
            dogtag_url = "https://ipa.example.com:8443"

            # Client certificate for mTLS authentication to Dogtag
            client_cert_path = "/opt/spire/conf/server/dogtag-client.crt"
            client_key_path  = "/opt/spire/conf/server/dogtag-client.key"

            # CA certificate to verify Dogtag's TLS server certificate
            ca_cert_path = "/etc/ipa/ca.crt"

            # Dogtag certificate profile for intermediate CA issuance
            profile_id = "caSpireIntermediateCA"

            # How long before expiry to start renewal (fraction of ca_ttl)
            renewal_threshold = "0.5"

            # Poll interval when waiting for certificate approval (if not auto-approved)
            poll_interval = "10s"

            # Maximum time to wait for Dogtag to issue the certificate
            request_timeout = "60s"
        }
    }
}
```

### Approach B configuration (certmonger-based)

```hcl
plugins {
    UpstreamAuthority "dogtag" {
        plugin_data {
            # Use certmonger mode instead of direct REST API
            mode = "certmonger"

            # Paths to the certmonger-managed certificate and key
            cert_file_path = "/etc/pki/spire/upstream-ca.crt"
            key_file_path  = "/etc/pki/spire/upstream-ca.key"

            # CA chain file (certmonger writes this alongside the cert)
            ca_chain_path = "/etc/pki/spire/ca-chain.crt"

            # How often to check for certificate file changes
            file_poll_interval = "30s"
        }
    }
}
```

## 8. Implementation Approaches

### Approach A: Direct Dogtag REST API

The plugin acts as an HTTP client, calling Dogtag's REST API directly using
mTLS for authentication.

**Request flow:**

```
Plugin                              Dogtag CA
  |                                    |
  |  POST /ca/rest/certrequests        |
  |  Content-Type: application/json    |
  |  Body: { profileId, csr }         |
  |----------------------------------->|
  |                                    |
  |  201 Created                       |
  |  Location: /ca/rest/certrequests/N |
  |<-----------------------------------|
  |                                    |
  |  GET /ca/rest/certrequests/N       |
  |----------------------------------->|
  |                                    |
  |  200 OK { requestStatus, certId }  |
  |<-----------------------------------|
  |                                    |
  |  GET /ca/rest/certs/{certId}       |
  |----------------------------------->|
  |                                    |
  |  200 OK { encoded certificate }    |
  |<-----------------------------------|
```

**Key implementation details:**

```go
type DogtagPlugin struct {
    config     *DogtagConfig
    httpClient *http.Client  // configured with mTLS
    mu         sync.Mutex
}

func (p *DogtagPlugin) MintX509CAAndSubscribe(
    req *upstreamauthorityv1.MintX509CAAndSubscribeRequest,
    stream upstreamauthorityv1.UpstreamAuthority_MintX509CAAndSubscribeServer,
) error {
    // 1. PEM-encode the CSR from req.Csr
    csrPEM := pem.EncodeToMemory(&pem.Block{
        Type:  "CERTIFICATE REQUEST",
        Bytes: req.Csr,
    })

    // 2. Submit enrollment request to Dogtag
    certReqID, err := p.submitEnrollment(csrPEM)
    if err != nil {
        return status.Errorf(codes.Internal, "enrollment failed: %v", err)
    }

    // 3. Poll for completion (or receive immediately if auto-approved)
    certPEM, err := p.waitForCert(certReqID)
    if err != nil {
        return status.Errorf(codes.Internal, "cert retrieval failed: %v", err)
    }

    // 4. Build the CA chain and upstream roots
    caChain, upstreamRoots, err := p.buildTrustChain(certPEM)
    if err != nil {
        return status.Errorf(codes.Internal, "chain build failed: %v", err)
    }

    // 5. Send the first (and possibly only) response
    err = stream.Send(&upstreamauthorityv1.MintX509CAAndSubscribeResponse{
        X509CaChain:       caChain,
        UpstreamX509Roots: upstreamRoots,
    })
    if err != nil {
        return err
    }

    // 6. Block until context is cancelled -- SPIRE manages re-calling
    //    this method for rotation via its own ca_ttl lifecycle
    <-stream.Context().Done()
    return nil
}
```

**Dogtag enrollment request body:**

```json
{
    "ProfileID": "caSpireIntermediateCA",
    "Input": [
        {
            "id": "i1",
            "ClassID": "certReqInputImpl",
            "Name": "Certificate Request Input",
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

**Advantages:**
- Full control over the enrollment lifecycle.
- No dependency on host-level tooling (certmonger, IPA CLI).
- Works in containerized SPIRE deployments without host access.
- Can implement retry logic, timeout handling, and detailed error reporting.

**Disadvantages:**
- Must handle Dogtag API versioning and authentication details.
- Requires a dedicated client certificate provisioned before first use.
- Plugin must parse Dogtag's XML/JSON response formats (they differ by endpoint).

### Approach B: IPA certmonger Integration

Instead of calling Dogtag directly, delegate certificate lifecycle to
`certmonger`, which is already deployed on IPA-enrolled hosts. The plugin
monitors certificate files on disk for changes.

**Setup:**

```bash
# Request certmonger to track the SPIRE upstream CA certificate
ipa-getcert request \
    -K spire/spire-server.example.com \
    -D spire-server.example.com \
    -f /etc/pki/spire/upstream-ca.crt \
    -k /etc/pki/spire/upstream-ca.key \
    -F /etc/pki/spire/ca-chain.crt \
    -T caSpireIntermediateCA \
    -C "/usr/bin/systemctl reload spire-server"
```

The plugin uses `fsnotify` or periodic polling to detect when certmonger
writes updated certificate files:

```go
func (p *DogtagPlugin) MintX509CAAndSubscribe(
    req *upstreamauthorityv1.MintX509CAAndSubscribeRequest,
    stream upstreamauthorityv1.UpstreamAuthority_MintX509CAAndSubscribeServer,
) error {
    // Note: In certmonger mode, the CSR from SPIRE is not used.
    // Certmonger manages its own key pair and CSR submission.
    // The plugin reads whatever cert certmonger has obtained.

    certPEM, keyPEM, err := p.readCertFiles()
    if err != nil {
        return status.Errorf(codes.Internal, "failed to read cert files: %v", err)
    }

    caChain, upstreamRoots, err := p.buildTrustChainFromFiles()
    if err != nil {
        return status.Errorf(codes.Internal, "chain build failed: %v", err)
    }

    // Send initial response
    err = stream.Send(&upstreamauthorityv1.MintX509CAAndSubscribeResponse{
        X509CaChain:       caChain,
        UpstreamX509Roots: upstreamRoots,
    })
    if err != nil {
        return err
    }

    // Watch for file changes (certmonger renewal)
    watcher, _ := fsnotify.NewWatcher()
    defer watcher.Close()
    watcher.Add(filepath.Dir(p.config.CertFilePath))

    for {
        select {
        case event := <-watcher.Events:
            if event.Name == p.config.CertFilePath && event.Op&fsnotify.Write != 0 {
                // Certmonger renewed the cert -- push update
                newChain, newRoots, err := p.buildTrustChainFromFiles()
                if err != nil {
                    continue // log and retry
                }
                stream.Send(&upstreamauthorityv1.MintX509CAAndSubscribeResponse{
                    X509CaChain:       newChain,
                    UpstreamX509Roots: newRoots,
                })
            }
        case <-stream.Context().Done():
            return nil
        }
    }
}
```

**Advantages:**
- Certmonger handles all Kerberos/IPA authentication.
- Automatic renewal is built in -- no custom rotation logic needed.
- Battle-tested in IPA environments; ops teams already understand certmonger.
- Post-renewal hooks (`-C` flag) can trigger SPIRE server reload.

**Disadvantages:**
- SPIRE's CSR is ignored -- certmonger generates its own key pair and CSR,
  which means SPIRE does not control the intermediate CA key. This is a
  significant architectural mismatch with SPIRE's design.
- Requires the SPIRE server to run on an IPA-enrolled host (not in a
  standalone container).
- File-watching introduces latency between renewal and SPIRE picking up
  the new certificate.
- Harder to test in CI/CD without a full IPA deployment.

### Recommendation

**Approach A (Direct REST API) is recommended** for the following reasons:

- It preserves SPIRE's expected key lifecycle: SPIRE generates the key pair
  and CSR; the upstream authority only signs the CSR.
- It works in containerized deployments where certmonger is not available.
- It provides tighter control over error handling, timeouts, and retry logic.

Approach B is a viable fallback for environments where the SPIRE server
already runs on an IPA host and operators prefer certmonger's management model,
but the CSR ownership mismatch is a fundamental design concern.

## 9. Security Considerations

### Least-privilege client certificate

The Dogtag client certificate used by the plugin should be scoped to a single
certificate profile (`caSpireIntermediateCA`). It should not use the IPA CA
admin agent certificate. This limits the blast radius if the client cert is
compromised -- the attacker can only issue intermediate CA certs under the
SPIRE profile, not arbitrary certificates.

### Trust domain boundaries

Each SPIRE trust domain should have its own Dogtag certificate profile with
a distinct Subject DN pattern (e.g., `CN=SPIRE Intermediate CA - <trust_domain>`).
This prevents one trust domain's plugin from requesting certificates that
could be confused with another trust domain's chain.

### Key storage on the SPIRE server

The plugin's client certificate private key should be stored with restrictive
permissions (`0600`, owned by the SPIRE server process user). In containerized
deployments, mount the key file as a read-only volume. Consider Kubernetes
Secrets or Vault for dynamic injection in orchestrated environments.

### Audit trail

All certificate enrollment requests through Dogtag are logged in Dogtag's
audit log (`/var/log/pki/pki-tomcat/ca/signedAudit/`). This provides an
immutable record of every intermediate CA certificate issued to SPIRE,
including the requesting agent's identity and the certificate serial number.

### Network security

The connection between the plugin and Dogtag must use TLS. The plugin
validates Dogtag's server certificate against the IPA CA root (`/etc/ipa/ca.crt`).
If SPIRE runs on a different network segment from the IPA server, ensure
port 8443 (Dogtag HTTPS) is reachable and that no TLS-terminating proxy
strips the client certificate.

### pathlen constraints

The Dogtag profile must issue certificates with `basicConstraints: CA:TRUE, pathlen:1`.
SPIRE mints its own server CA beneath the upstream intermediate, so `pathlen:0`
is too restrictive (this was a known issue in the PoC -- see workload-identity-poc
Known Issues #2).

## 10. Deployment

### Prerequisites

1. A FreeIPA server with Dogtag CA operational.
2. A custom Dogtag certificate profile (`caSpireIntermediateCA`) imported and enabled.
3. A service principal and client certificate for the SPIRE server.
4. SPIRE server v1.11+ (tested with 1.11.3).

### Deployment steps

1. **Create the Dogtag profile** on the IPA server:

   ```bash
   # Import the profile configuration
   ipa certprofile-import caSpireIntermediateCA \
       --file=caSpireIntermediateCA.cfg \
       --desc="SPIRE Intermediate CA" \
       --store=true

   # Add a CA ACL allowing the SPIRE service to use this profile
   ipa caacl-add spire-intermediate-ca-acl
   ipa caacl-add-profile spire-intermediate-ca-acl --certprofile=caSpireIntermediateCA
   ipa caacl-add-service spire-intermediate-ca-acl --service=spire/spire-server.example.com
   ```

2. **Provision the client certificate** for the plugin:

   ```bash
   # Generate a key pair on the SPIRE server
   openssl genrsa -out /opt/spire/conf/server/dogtag-client.key 4096

   # Create a CSR
   openssl req -new \
       -key /opt/spire/conf/server/dogtag-client.key \
       -out /tmp/dogtag-client.csr \
       -subj "/O=EXAMPLE.COM/CN=spire/spire-server.example.com"

   # Submit via IPA
   ipa cert-request /tmp/dogtag-client.csr \
       --principal=spire/spire-server.example.com \
       --profile-id=caIPAserviceCert

   # Retrieve and save the certificate
   ipa cert-show <serial> --out=/opt/spire/conf/server/dogtag-client.crt

   chmod 600 /opt/spire/conf/server/dogtag-client.key
   chmod 644 /opt/spire/conf/server/dogtag-client.crt
   ```

3. **Build and install the plugin** binary:

   ```bash
   cd spire-plugin-dogtag/
   go build -o /opt/spire/plugins/upstream-authority-dogtag ./cmd/plugin
   ```

4. **Update SPIRE server.conf** to use the new plugin (replace the `UpstreamAuthority "disk"` block with the configuration from Section 7).

5. **Restart SPIRE server** and verify logs show successful CA enrollment:

   ```
   INFO  UpstreamAuthority(dogtag): intermediate CA certificate obtained
   INFO  UpstreamAuthority(dogtag): serial=0x1A2B3C, expires=2026-04-22T00:00:00Z
   ```

## 11. Effort Estimate

| Task | Estimate | Notes |
|------|----------|-------|
| Dogtag REST API client (Go) | 2-3 days | mTLS setup, enrollment, cert retrieval |
| UpstreamAuthority plugin scaffolding | 1-2 days | SPIRE plugin SDK, protobuf, registration |
| Certificate profile creation | 0.5 day | Profile config, CA ACL, testing |
| Rotation / stream lifecycle | 1-2 days | Re-enrollment, stream updates, error handling |
| Integration tests | 2-3 days | Requires IPA + SPIRE test environment |
| Documentation and deployment guide | 1 day | Config examples, troubleshooting |
| **Total** | **7-12 days** | Single developer, assuming existing IPA environment |

The certmonger-based Approach B would be approximately 3-5 days (simpler
implementation but requires testing the file-watching and CSR ownership
workaround).

## 12. Open Questions

1. **Profile approval mode.** Should the Dogtag profile use auto-approval, or
   should it require agent approval? Auto-approval is simpler but reduces the
   audit checkpoint. A compromise is auto-approval with Dogtag audit logging
   and a rate-limiting constraint on the profile.

2. **SPIRE plugin type: built-in vs. external.** SPIRE supports both built-in
   plugins (compiled into the server binary) and external plugins (separate
   process, gRPC). An external plugin is easier to develop and deploy
   independently, but adds a process management dependency. Which model
   should we target first?

3. **Dogtag API version.** Dogtag exposes both legacy XML endpoints and newer
   JSON endpoints. The JSON API is more ergonomic from Go, but some operations
   (particularly profile-based enrollment) may only be fully supported in XML.
   Need to verify JSON API coverage for the enrollment workflow on RHEL 9 / CS 11.

4. **Sub-CA vs. root CA.** Should the plugin request certificates from the IPA
   root CA directly, or from a dedicated Dogtag sub-CA (lightweight CA)? A
   sub-CA provides better isolation -- if compromised, only the sub-CA needs
   to be revoked, not the entire IPA root.

5. **CRL / OCSP integration.** Should the intermediate CA certificate reference
   a CRL distribution point or OCSP responder? SPIRE does not natively check
   revocation for upstream CAs, but downstream consumers of the trust bundle
   might.

6. **Multi-server SPIRE.** In a SPIRE HA deployment with multiple servers,
   each server calls `MintX509CAAndSubscribe` independently. Does each server
   get its own intermediate CA cert from Dogtag, or should they share one?
   Independent certs are simpler but increase load on Dogtag.

7. **Upstream contribution.** Should this plugin be contributed to the
   `spiffe/spire` repository as a built-in plugin, or maintained as a
   standalone project under the `freeipa` or `dogtagpki` GitHub org?
   Upstream inclusion increases visibility but subjects the plugin to SPIRE's
   release cadence.
