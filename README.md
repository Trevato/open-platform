# Open Platform

Self-hosted developer infrastructure on Kubernetes. Git hosting, CI/CD, object storage, GitOps, and cluster management — all authenticated through a single identity provider.

VxRail (NixOS) runs the k3s control plane. Mac joins optionally as a compute agent via Colima.

```
forgejo.product-garden.com     Git, packages, container registry, SSO
ci.product-garden.com          CI/CD pipelines (Woodpecker)
headlamp.dev.test              Kubernetes dashboard
minio.dev.test                 S3-compatible storage
social.product-garden.com      Social app (from template)
minecraft.product-garden.com   Minecraft server hosting (from template)
```

All services are also available at `*.dev.test` locally.

## Deploy

```bash
cp .env.example .env   # fill in passwords, Cloudflare tokens, k3s join info
make deploy            # everything — secrets, services, OAuth2, system org, GitOps
```

On first deploy, the platform:
1. Bootstraps all services via Helmfile
2. Creates a `system` org in Forgejo with an app template and demo apps
3. Installs Flux and connects it to `system/open-platform`
4. Flux adopts all releases — the platform is now self-managing

After that, push changes to `system/open-platform` on Forgejo → Flux reconciles → platform updates.

## Mac Agent (Optional)

Join a Mac as additional compute:

```bash
make mac-start   # start Colima VM, join VxRail cluster as k3s agent
make mac-stop    # drain and stop the Mac agent
```

Requires `K3S_SERVER`, `K3S_TOKEN`, and `NODE_EXTERNAL_IP` set in `.env`.

## First-Time Setup

After `make deploy` completes, one manual step is required for Headlamp SSO to work with the Kubernetes API:

```bash
# Get the auto-generated Headlamp client ID
kubectl get secret oidc -n headlamp -o jsonpath='{.data.OIDC_CLIENT_ID}' | base64 -d
```

On VxRail, add the OIDC flags to `~/nix-darwin-config/modules/nixos.nix` and rebuild:
```bash
ssh vxrail 'sudo nixos-rebuild switch --flake ~/nix-darwin-config#otavert-vxrail'
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

- `scripts/ensure-secrets.sh` — creates K8s secrets from `.env` (validates required vars)
- `scripts/setup-oauth2.sh` — registers OAuth2 apps in Forgejo
- `scripts/setup-system-org.sh` — creates system org, pushes template and platform config
- `scripts/setup-woodpecker-repos.sh` — activates repos in Woodpecker, sets org-level secrets
- `scripts/setup-flux.sh` — connects Flux to `system/open-platform`

### Steady State (Flux)

After bootstrap, [Flux](https://fluxcd.io/) watches `system/open-platform` on Forgejo and reconciles all platform services. The platform config lives in `platform/` — HelmRelease resources with inlined values, organized into dependency layers:

```
infra-controllers (traefik, cnpg)
        ↓
infra-configs (minio, postgres, namespaces, TLS, cloudflared)
        ↓
identity (forgejo, OIDC RBAC)
        ↓
apps (headlamp, woodpecker, oauth2-proxy)
```

### App Development (Woodpecker)

The `system/template` repo is a Next.js 15 app scaffold with:
- **Deploy pipeline**: Kaniko build → push to Forgejo container registry → kubectl deploy
- **Preview pipeline**: build → provision isolated DB/bucket → seed → deploy preview → comment URL on PR
- **Cleanup pipeline**: delete preview resources on PR close
- **Reset pipeline**: manual data wipe and re-seed

Create a new app: use `system/template` as a template in Forgejo → new repo with CI/CD ready to go. Org-level secrets are inherited automatically.

## Domains

| Domain | Purpose |
|--------|---------|
| `*.product-garden.com` | Public access via Cloudflare Tunnel (canonical URLs) |
| `*.dev.test` | Local access via self-signed TLS + /etc/hosts |

Both resolve to the same services. OAuth flows use `forgejo.product-garden.com` for browser redirects and `forgejo.dev.test` for server-side token exchange (avoids Cloudflare hairpin).

## Prerequisites

- VxRail server running NixOS with k3s
- [Helm](https://helm.sh) + [Helmfile](https://github.com/helmfile/helmfile)
- `curl` and `jq` (used by automation scripts)
- `*.dev.test` resolving to the cluster (via `/etc/hosts` or local DNS)
- Self-signed CA trusted by your browser (see `certs/`)
- Cloudflare account with tunnel configured (for `*.product-garden.com`)
- Optional: [Colima](https://github.com/abiosoft/colima) for Mac agent

## Secrets

Bootstrap credentials (admin password, DB password, Cloudflare tunnel token, k3s join token) live in `.env` which is gitignored. OAuth2 client credentials are auto-generated and stored directly in Kubernetes secrets — they never touch disk.
