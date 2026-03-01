# Open Platform

Self-hosted developer infrastructure on Kubernetes. Git hosting, CI/CD, object storage, GitOps, and cluster management — all authenticated through a single identity provider.

```
forgejo.dev.test    Git, packages, container registry, SSO
ci.dev.test         CI/CD pipelines (Woodpecker)
headlamp.dev.test   Kubernetes dashboard
minio.dev.test      S3-compatible storage
demo-app.dev.test   Demo app (deployed from template)
```

## Deploy

```bash
cp .env.example .env   # fill in passwords (use openssl rand -base64 16)
make deploy            # everything — secrets, services, OAuth2, system org, GitOps
```

On first deploy, the platform:
1. Bootstraps all services via Helmfile
2. Creates a `system` org in Forgejo with an app template and demo app
3. Installs Flux and connects it to `system/open-platform`
4. Flux adopts all releases — the platform is now self-managing

After that, push changes to `system/open-platform` on Forgejo → Flux reconciles → platform updates.

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

## How It Works

### Bootstrap (Helmfile)

[Helmfile](https://github.com/helmfile/helmfile) orchestrates seven Helm releases with dependency ordering. Shell scripts handle the parts that need API calls:

- `scripts/ensure-secrets.sh` — creates K8s secrets from `.env`
- `scripts/setup-oauth2.sh` — registers OAuth2 apps in Forgejo
- `scripts/setup-system-org.sh` — creates system org, pushes template and platform config
- `scripts/setup-flux.sh` — connects Flux to `system/open-platform`

### Steady State (Flux)

After bootstrap, [Flux](https://fluxcd.io/) watches `system/open-platform` on Forgejo and reconciles all platform services. The platform config lives in `platform/` — HelmRelease resources with inlined values, organized into dependency layers:

```
infra-controllers (traefik, cnpg)
        ↓
infra-configs (minio, postgres, namespaces, TLS)
        ↓
identity (forgejo, OIDC RBAC)
        ↓
apps (headlamp, woodpecker)
```

### App Development (Woodpecker)

The `system/template` repo is a Bun/TypeScript app scaffold with:
- **PR pipeline**: lint, typecheck, test
- **Deploy pipeline**: Kaniko build → push to Forgejo container registry → kubectl deploy

Create a new app: use `system/template` as a template in Forgejo → new repo with CI/CD ready to go.

## Prerequisites

- [Colima](https://github.com/abiosoft/colima) with k3s runtime
- [Helm](https://helm.sh) + [Helmfile](https://github.com/helmfile/helmfile)
- `curl` and `jq` (used by automation scripts)
- `*.dev.test` resolving to your cluster (via `/etc/hosts` or local DNS)
- Self-signed CA trusted by your browser (see `certs/`)

## Secrets

Bootstrap credentials (admin password, DB password, etc.) live in `.env` which is gitignored. OAuth2 client credentials are auto-generated and stored directly in Kubernetes secrets — they never touch disk.
