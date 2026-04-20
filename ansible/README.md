# Ansible Roles for Dogtag PKI

Ansible roles for provisioning a Dogtag Certificate Authority and deploying the Dogtag WebUI container.

## Roles

- **dogtag_ca** — Installs and configures 389 Directory Server + Dogtag CA on a RHEL/Fedora host
- **dogtag_webui** — Builds and runs the Dogtag WebUI container (from [dogtag-webui](https://github.com/Amy-Ra-lph/dogtag-webui))

## Playbooks

| Playbook | Description |
|----------|-------------|
| `site.yml` | Full deployment (CA + WebUI) |
| `provision-ca.yml` | CA provisioning only |
| `deploy-webui.yml` | WebUI container deployment only |

## Prerequisites

- RHEL 9 / Fedora target host
- Ansible 2.14+
- Collections: `containers.podman`, `ansible.posix` (see `requirements.yml`)

```bash
ansible-galaxy collection install -r requirements.yml
```

## Setup

1. Copy the vault example and encrypt it:

```bash
cp group_vars/pki_servers/vault.yml.example group_vars/pki_servers/vault.yml
ansible-vault encrypt group_vars/pki_servers/vault.yml
```

2. Edit `inventory/hosts.yml` with your target host.

3. Run the playbook:

```bash
ansible-playbook site.yml --ask-vault-pass
```

## LDAPS Configuration

By default, the CA role provisions 389 DS with LDAPS enabled (port 636) and configures pkispawn to use the secure connection. The DS instance generates a self-signed server certificate during setup.

| Variable | Default | Description |
|----------|---------|-------------|
| `dogtag_ds_port` | `389` | LDAP plaintext port |
| `dogtag_ds_secure_port` | `636` | LDAPS port |
| `dogtag_ds_secure_connection` | `true` | Use LDAPS for CA-to-DS connection |

To disable LDAPS (e.g., for local testing):

```yaml
dogtag_ds_secure_connection: false
```

## Security Notes

- All passwords are stored in Ansible Vault (never in plaintext)
- Passwords are passed to commands via temporary files (not shell arguments)
- Sensitive tasks use `no_log: true`
- LDAPS enabled by default (addresses security finding #18)
- See [SECURITY.md](https://github.com/Amy-Ra-lph/dogtag-webui/blob/main/SECURITY.md) in the WebUI repo for the full audit
