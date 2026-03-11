# Open Platform

Self-hosted developer platform on Kubernetes. Git hosting, CI/CD, object storage, dashboards, and cluster management — all authenticated through a single identity provider.

## What You Get

- **Forgejo** — Git, packages, container registry, SSO
- **Woodpecker CI** — CI/CD pipelines
- **Headlamp** — Kubernetes dashboard
- **MinIO** — S3-compatible storage
- **Console** — Platform management dashboard
- **Flux** — GitOps (self-managing after bootstrap)
- **PostgreSQL** — CNPG operator

All services use a single domain (`*.yourdomain.com`) and authenticate through Forgejo as the central identity provider.

## Quick Start

```bash
# 1. Clone and configure
git clone <repo-url>
cd open-platform
cp open-platform.yaml.example open-platform.yaml
# Edit open-platform.yaml — set domain, admin user, TLS mode

# 2. Generate and deploy
make deploy
```

## How It Works

1. `open-platform.yaml` defines your platform (domain, admin, TLS mode)
2. `generate-config.sh` creates all Helm values and Flux manifests from templates
3. `deploy.sh` bootstraps services via Helmfile with automated hooks
4. Flux adopts all releases — platform is now self-managing
5. Push changes to `system/open-platform` on your Forgejo → Flux reconciles

## Configuration

See `open-platform.yaml.example` for all options:

- `domain` — your platform domain (e.g., `dev.test`, `myplatform.com`)
- `admin.username` / `admin.email` — platform admin
- `tls_mode` — `selfsigned`, `letsencrypt`, or `cloudflare`
- `cloudflare` — optional tunnel configuration
- `service_prefix` — optional prefix for multi-tenant deployments

## App Development

Create apps from the built-in template:

1. Use `system/template` as a template in Forgejo to create a new repo
2. CI/CD pipelines are included — push to deploy
3. PR previews with isolated databases and storage

The template includes: Next.js 15, PostgreSQL, S3, Forgejo OAuth2, 4 CI workflows.

## Day-to-Day

```bash
make deploy     # idempotent full sync
make diff       # preview changes
make status     # check release status
make urls       # print service URLs
```

## Prerequisites

- Linux server with k3s (or any Kubernetes cluster)
- Helm + Helmfile
- curl and jq

## Documentation

- `CLAUDE.md` — comprehensive architecture reference
- `open-platform.yaml.example` — configuration reference
- `config/templates/` — all configuration templates

## License

Apache License 2.0 — see [LICENSE](LICENSE)
