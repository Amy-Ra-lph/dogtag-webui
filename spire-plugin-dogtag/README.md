# SPIRE UpstreamAuthority Plugin for Dogtag PKI

A SPIRE external plugin that obtains intermediate CA certificates from Dogtag PKI,
chaining SPIRE's trust under an IPA/Dogtag CA hierarchy.

## What it does

Instead of using a static CA key on disk (`UpstreamAuthority "disk"`), this plugin
submits CSRs to Dogtag's REST API and receives signed intermediate CA certificates.
This gives you:

- **Automated rotation** — SPIRE requests a new intermediate before the old one expires
- **HSM-backed keys** — Dogtag can store the CA signing key in an HSM
- **Single trust root** — workload SVIDs chain to the IPA root CA
- **Audit trail** — every intermediate CA issuance is logged in Dogtag's signed audit log

## Certificate chain

```
IPA Root CA (Dogtag)
  └── SPIRE Intermediate CA (issued by this plugin)
        └── SPIRE Server CA (minted by SPIRE)
              └── Workload X.509 SVID
```

## Build

### Container (recommended — no Go on the host)

```bash
podman build -t spire-server-dogtag -f Containerfile .
```

This produces a SPIRE Server image with the plugin binary at
`/opt/spire/plugins/upstream-authority-dogtag`.

### Standalone binary

```bash
go build -o upstream-authority-dogtag ./cmd/plugin
```

## Prerequisites

1. Dogtag CA with the `caSpireIntermediateCA` profile imported:

   ```bash
   ipa certprofile-import caSpireIntermediateCA \
       --file=caSpireIntermediateCA.cfg \
       --desc="SPIRE Intermediate CA" \
       --store=true
   ```

2. A CA ACL allowing the SPIRE service to use the profile:

   ```bash
   ipa service-add spire/spire-server.example.com
   ipa caacl-add spire-intermediate-ca-acl
   ipa caacl-add-profile spire-intermediate-ca-acl --certprofile=caSpireIntermediateCA
   ipa caacl-add-service spire-intermediate-ca-acl --service=spire/spire-server.example.com
   ```

3. A client certificate for the plugin (mTLS authentication to Dogtag):

   ```bash
   openssl genrsa -out dogtag-client.key 4096
   openssl req -new -key dogtag-client.key -out dogtag-client.csr \
       -subj "/O=EXAMPLE.COM/CN=spire/spire-server.example.com"
   ipa cert-request dogtag-client.csr \
       --principal=spire/spire-server.example.com \
       --profile-id=caIPAserviceCert
   ipa cert-show <serial> --out=dogtag-client.crt
   ```

## SPIRE server configuration

```hcl
UpstreamAuthority "dogtag" {
    plugin_cmd = "/opt/spire/plugins/upstream-authority-dogtag"
    plugin_data {
        dogtag_url       = "https://ipa.example.com:8443"
        client_cert_path = "/opt/spire/conf/server/dogtag-client.crt"
        client_key_path  = "/opt/spire/conf/server/dogtag-client.key"
        ca_cert_path     = "/opt/spire/conf/server/ca.crt"
        profile_id       = "caSpireIntermediateCA"
        poll_interval    = "10s"
        request_timeout  = "60s"
    }
}
```

See `server.conf.example` for a complete SPIRE server configuration.

## Container deployment

```bash
podman run -d --name spire-server \
    -v ./conf:/opt/spire/conf/server:ro,z \
    -v spire-data:/opt/spire/data/server:z \
    -p 8081:8081 \
    spire-server-dogtag
```

Mount your `server.conf`, client cert, client key, and CA cert into
`/opt/spire/conf/server/`.

## How it works

1. SPIRE calls `MintX509CAAndSubscribe` with a DER-encoded CSR
2. The plugin PEM-encodes the CSR and submits it to Dogtag's `/ca/rest/certrequests`
3. If the profile is auto-approved, Dogtag returns the signed cert immediately;
   otherwise the plugin polls until approval or timeout (5 min)
4. The plugin retrieves the signed intermediate CA cert and the Dogtag root CA cert
5. Both are returned to SPIRE as the X.509 CA chain and upstream trust roots
6. The plugin blocks on the stream until SPIRE cancels it (at `ca_ttl / 2` for rotation)

## Design

See `docs/design-spire-upstream-authority.md` in the parent repository for the
full design document, including security considerations, TTL alignment, and
alternative approaches.
