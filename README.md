# Open Platform

Self-hosted developer infrastructure on Kubernetes. Git hosting, CI/CD, object storage, and cluster management — all authenticated through a single identity provider.

```
forgejo.dev.test    Git, packages, SSO
ci.dev.test         CI/CD pipelines
headlamp.dev.test   Kubernetes dashboard
minio.dev.test      S3-compatible storage
```

## Deploy

```bash
cp .env.example .env   # fill in passwords (use openssl rand -base64 16)
make deploy            # everything — secrets, services, OAuth2 apps
```

Secrets are created automatically. OAuth2 applications are registered in Forgejo via its API. All services come up in dependency order. Takes about 60 seconds from a clean cluster.

## First-Time Setup

After `make deploy` completes, one manual step is required for Headlamp SSO to work with the Kubernetes API:

```bash
# Get the auto-generated Headlamp client ID
kubectl get secret oidc -n headlamp -o jsonpath='{.data.OIDC_CLIENT_ID}' | base64 -d

# Update k3s API server config in the Colima VM
colima ssh -- sudo vi /etc/rancher/k3s/config.yaml
# Set oidc-client-id to the value above

# Restart k3s to apply
colima ssh -- sudo systemctl restart k3s
```

This is only needed once. After that, `make deploy` is fully idempotent.

## Day-to-Day

```bash
make deploy     # idempotent full sync
make diff       # preview changes before applying
make status     # check release status
make urls       # print service URLs
make lint       # validate all releases
make teardown   # destroy all Open Platform releases (with confirmation)
```

## Prerequisites

- [Colima](https://github.com/abiosoft/colima) with k3s runtime
- [Helm](https://helm.sh) + [Helmfile](https://github.com/helmfile/helmfile)
- `curl` and `jq` (used by automation scripts)
- `*.dev.test` resolving to your cluster (via `/etc/hosts` or local DNS)
- Self-signed CA trusted by your browser (see `certs/`)

## How It Works

[Helmfile](https://github.com/helmfile/helmfile) orchestrates six Helm releases with dependency ordering. Raw Kubernetes manifests (namespaces, RBAC, TLS config) are applied via hooks. Two shell scripts handle secret management:

- `scripts/ensure-secrets.sh` — creates bootstrap K8s secrets from `.env` (runs before any release)
- `scripts/setup-oauth2.sh` — registers OAuth2 apps in Forgejo via API, stores credentials as K8s secrets (runs after Forgejo is up)

Both are idempotent. Running `make deploy` ten times produces the same result as running it once.

## Secrets

Bootstrap credentials (admin password, DB password, etc.) live in `.env` which is gitignored. OAuth2 client credentials are auto-generated and stored directly in Kubernetes secrets — they never touch disk.
