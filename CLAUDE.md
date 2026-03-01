# Open Platform — Agent Reference

Self-hosted developer platform running on k3s (via Colima) on macOS. All services authenticate through Forgejo as the OIDC/OAuth2 identity provider. The platform is self-seeding and self-managing via Flux GitOps.

## Architecture

```
Browser ──► Traefik (ingress) ──┬── forgejo.dev.test ──► Forgejo (git, packages, OIDC provider)
                                ├── ci.dev.test ──────► Woodpecker (CI/CD)
                                ├── headlamp.dev.test ─► Headlamp (K8s dashboard)
                                ├── minio.dev.test ───► MinIO Console
                                ├── s3.dev.test ──────► MinIO S3 API
                                └── demo-app.dev.test ─► Demo App (from template)

Forgejo ──► PostgreSQL (CNPG cluster, postgres namespace)
Woodpecker ──► Forgejo (SCM integration, OAuth2)
Headlamp ──► Forgejo (OIDC) ──► K8s API Server (OIDC token validation)

Flux (flux-system) ──► system/open-platform on Forgejo ──► reconciles all platform services
```

### Two deployment models

- **Flux** manages the platform. `platform/` directory contains HelmReleases + manifests, pushed to `system/open-platform` on Forgejo. Changes auto-apply via Flux reconciliation.
- **Woodpecker CI** deploys apps. App template includes PR workflows (lint, test) and deploy workflows (Kaniko build → Forgejo registry → kubectl deploy).

## Services

### Forgejo (Git + Identity Provider)
- **Config**: `platform/identity/forgejo.yaml` (Flux HelmRelease), `forgejo-values.yaml` (helmfile bootstrap)
- **Namespace**: `forgejo`
- **Domain**: `forgejo.dev.test`
- **Helm chart**: `oci://code.forgejo.org/forgejo-helm/forgejo` (version pinned via OCIRepository semver)
- **Database**: PostgreSQL at `postgres-rw.postgres.svc.cluster.local:5432`, database `forgejo`
- **Role**: Central identity provider. All other services authenticate through Forgejo OAuth2 applications.
- **Secrets**: `forgejo-admin-credentials` (admin user), `forgejo-db-config` (database password) — both referenced as existing K8s secrets
- **Features enabled**: OAuth2 provider, OpenID signin, package/container registry, LFS, organization creation

### Headlamp (Kubernetes Dashboard)
- **Config**: `platform/apps/headlamp.yaml` (Flux HelmRelease), `headlamp-values.yaml` (helmfile bootstrap)
- **Namespace**: `headlamp`
- **Domain**: `headlamp.dev.test`
- **Helm chart**: `headlamp/headlamp`
- **Auth**: OIDC via Forgejo using the chart's `externalSecret` pattern (Option 3). The `oidc` secret in the headlamp namespace is created by `scripts/setup-oauth2.sh` with keys: `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_ISSUER_URL`, `OIDC_SCOPES`, `OIDC_CALLBACK_URL`.
- **Callback URL**: `https://headlamp.dev.test/oidc-callback`
- **TLS skip**: `HEADLAMP_CONFIG_OIDC_SKIP_TLS_VERIFY=true` env var skips TLS verification for the OIDC backchannel (required because of self-signed certs)

### Woodpecker (CI/CD)
- **Config**: `platform/apps/woodpecker.yaml` (Flux HelmRelease), `woodpecker-values.yaml` (helmfile bootstrap)
- **Namespace**: `woodpecker`
- **Domain**: `ci.dev.test`
- **Helm chart**: `woodpecker/woodpecker`
- **Auth**: Forgejo OAuth2 integration. Redirect URI: `http://ci.dev.test/authorize`
- **Backend**: Kubernetes-native (pipelines run as pods)
- **Secrets**: `woodpecker-secrets` — contains `WOODPECKER_AGENT_SECRET`, `WOODPECKER_FORGEJO_CLIENT`, `WOODPECKER_FORGEJO_SECRET`. Loaded via `extraSecretNamesForEnvFrom`.
- **RBAC**: `woodpecker-deployer` ClusterRole grants the agent and pipeline pods permissions to manage deployments, services, secrets, pods, ingresses, and jobs. `woodpecker-pipeline` ServiceAccount is used by CI deploy steps.
- **Image builds**: Uses Kaniko (woodpeckerci/plugin-kaniko) — works in K8s backend without Docker daemon. `skip_tls_verify: true` for self-signed Forgejo registry.

### MinIO (Object Storage)
- **Config**: `platform/infrastructure/configs/minio.yaml` (Flux HelmRelease), `minio-values.yaml` (helmfile bootstrap)
- **Namespace**: `minio`
- **Domains**: `minio.dev.test` (console), `s3.dev.test` (S3 API)
- **Helm chart**: `minio/minio`
- **Mode**: standalone, 20Gi storage
- **Secrets**: `minio-credentials` (rootUser, rootPassword)

### PostgreSQL (CNPG)
- **Config**: `platform/infrastructure/configs/postgres-cluster.yaml` (Flux-managed), `manifests/postgres-cluster.yaml` (helmfile bootstrap)
- **Namespace**: `postgres`
- **Access**: `postgres-rw.postgres.svc.cluster.local:5432`
- **Instances**: 1 (non-HA, dev environment)
- **Databases**: `forgejo`, `platform_ledger`, `product_garden`
- **Resources**: 256Mi–1Gi memory, 100m–1000m CPU, 10Gi storage
- **Max connections**: 200

### Flux (GitOps)
- **Config**: `helmfile.yaml` (bootstrap), `scripts/setup-flux.sh` (bootstrap resources)
- **Namespace**: `flux-system`
- **Helm chart**: `fluxcd-community/flux2`
- **Role**: Watches `system/open-platform` on Forgejo, reconciles all platform HelmReleases and manifests
- **Secrets**: `forgejo-auth` in flux-system — admin credentials + CA cert for Forgejo git access
- **Self-signed CA**: Referenced via `secretRef` in GitRepository spec

## System Org

Created by `scripts/setup-system-org.sh` during first deploy. Contains:

| Repo | Purpose |
|------|---------|
| `system/open-platform` | Platform config — Flux HelmReleases + K8s manifests. Source of truth for all platform services. |
| `system/template` | App template — Bun/TypeScript scaffold with Dockerfile, K8s manifests, Woodpecker CI workflows. Marked as template repo. |
| `system/demo-app` | Created from template. Deployed at `demo-app.dev.test` (traefik/whoami initially). |

## Namespace Layout

| Namespace | Services |
|-----------|----------|
| `kube-system` | Traefik, CoreDNS, metrics-server |
| `cnpg-system` | CNPG operator |
| `postgres` | PostgreSQL cluster |
| `forgejo` | Forgejo |
| `headlamp` | Headlamp |
| `woodpecker` | Woodpecker server + agent + pipeline pods |
| `minio` | MinIO |
| `flux-system` | Flux controllers (source, kustomize, helm, notification) |
| `demo-app` | Demo application |

## Deployment

### Bootstrap (first deploy)
```bash
cp .env.example .env        # fill in passwords
make deploy                 # helmfile bootstraps everything, Flux takes over
```

### Steady state (after bootstrap)
Push changes to `system/open-platform` on Forgejo → Flux reconciles within ~1 minute.

### Recovery
```bash
make deploy                 # re-bootstraps everything, Flux re-adopts
```

### Day-to-Day
```bash
make deploy   # idempotent helmfile sync (bootstrap + Flux adoption)
make diff     # preview changes
make status   # check release status
```

### Release Layers (Helmfile Bootstrap)
| Layer | Releases | Label |
|-------|----------|-------|
| 0 — Infrastructure | traefik, cnpg | `tier: infra` |
| 1 — Storage | minio | `tier: infra` |
| 2 — Identity | forgejo | `tier: infra` |
| 3 — Consumers | headlamp, woodpecker | `tier: apps` |
| 4 — GitOps | flux | `tier: platform` |

### Flux Kustomization Layers (Ongoing Management)
| Layer | Resources | Path |
|-------|-----------|------|
| infra-controllers | traefik, cnpg | `platform/infrastructure/controllers/` |
| infra-configs | minio, postgres, namespaces, TLS | `platform/infrastructure/configs/` |
| identity | forgejo, OIDC RBAC | `platform/identity/` |
| apps | headlamp, woodpecker, RBAC | `platform/apps/` |

Layers enforce ordering via `dependsOn`. Each uses `wait: true`.

### Hook Execution Order (Bootstrap)
1. **traefik presync**: apply `manifests/namespaces.yaml`, run `scripts/ensure-secrets.sh`, create wildcard TLS secret
2. **traefik postsync**: apply `manifests/traefik-tls.yaml` (TLSStore)
3. **cnpg postsync**: wait for operator readiness, apply `manifests/postgres-cluster.yaml`
4. **forgejo postsync**: apply `manifests/oidc-rbac.yaml`, run `scripts/setup-oauth2.sh`, run `scripts/setup-system-org.sh`
5. **woodpecker postsync**: apply `manifests/woodpecker-rbac.yaml`
6. **flux postsync**: run `scripts/setup-flux.sh` (GitRepository, root Kustomization, wait for reconciliation)

### Platform Config (`platform/`)
| Path | Contents |
|------|----------|
| `platform/cluster/` | Flux Kustomization resources defining layer ordering |
| `platform/infrastructure/controllers/` | HelmReleases for traefik, cnpg |
| `platform/infrastructure/configs/` | Namespaces, TLSStore, minio HelmRelease, postgres cluster |
| `platform/identity/` | Forgejo HelmRelease (OCIRepository), OIDC RBAC |
| `platform/apps/` | Headlamp + Woodpecker HelmReleases, RBAC |

### App Template (`templates/app/`)
| Path | Contents |
|------|----------|
| `src/index.ts` | Bun HTTP server |
| `Dockerfile` | Multi-stage Bun build |
| `package.json` | Scripts: dev, lint, typecheck, test |
| `tsconfig.json` | Strict TypeScript config |
| `k8s/` | Deployment (traefik/whoami), Service, Ingress |
| `.woodpecker/test.yaml` | PR pipeline: install, lint, typecheck, test |
| `.woodpecker/deploy.yaml` | Deploy pipeline: Kaniko build, push to Forgejo, kubectl deploy |

### Manifests (`manifests/`)
| File | Purpose |
|------|---------|
| `namespaces.yaml` | All user-created namespaces (including demo-app) |
| `postgres-cluster.yaml` | CNPG Cluster resource |
| `woodpecker-rbac.yaml` | Woodpecker agent + pipeline RBAC |
| `traefik-tls.yaml` | Default TLSStore for wildcard cert |
| `oidc-rbac.yaml` | ClusterRoleBinding for OIDC user (`trevato` → `cluster-admin`) |

## Secrets Management

### Bootstrap Secrets (from `.env`)
Created by `scripts/ensure-secrets.sh` (runs as traefik presync hook):
- `forgejo-admin-credentials` (forgejo ns) — username, password
- `forgejo-db-config` (forgejo ns) — password
- `forgejo-db-credentials` (postgres ns) — username, password (for CNPG bootstrap)
- `minio-credentials` (minio ns) — rootUser, rootPassword
- `woodpecker-secrets` (woodpecker ns) — WOODPECKER_AGENT_SECRET (preserves OAuth2 fields if they exist)

### OAuth2 Secrets (auto-generated)
Created by `scripts/setup-oauth2.sh` (runs as forgejo postsync hook):
- `oidc` (headlamp ns) — `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_ISSUER_URL`, `OIDC_SCOPES`, `OIDC_CALLBACK_URL`
- `woodpecker-secrets` (woodpecker ns) — merges `WOODPECKER_FORGEJO_CLIENT`, `WOODPECKER_FORGEJO_SECRET` into existing secret

### Flux Secrets
Created by `scripts/setup-flux.sh` (runs as flux postsync hook):
- `forgejo-auth` (flux-system ns) — admin username, password, CA cert for git access

### Scripts
| Script | Trigger | Purpose |
|--------|---------|---------|
| `scripts/ensure-secrets.sh` | traefik presync | Creates namespaces + bootstrap K8s secrets from `.env` |
| `scripts/setup-oauth2.sh` | forgejo postsync | Creates OAuth2 apps via Forgejo API + K8s secrets |
| `scripts/setup-system-org.sh` | forgejo postsync | Creates system org, pushes platform config + template, seeds demo-app |
| `scripts/setup-flux.sh` | flux postsync | Creates Flux bootstrap resources (GitRepository, Kustomization) |

All scripts are idempotent — safe to run on every `make deploy`.

## TLS Setup

- Self-signed CA: `certs/ca.crt` (issuer: "OpenPlatform Local CA", valid 10 years)
- Wildcard cert: `certs/wildcard.crt` for `*.dev.test` and `dev.test`
- Private keys (`ca.key`, `wildcard.key`) are gitignored
- The CA cert must be installed inside the Colima VM at `/usr/local/share/ca-certificates/openplatform.crt` for the k3s API server to validate Forgejo's OIDC tokens
- Browsers need the CA trusted to avoid certificate warnings
- Flux source-controller uses the CA cert from `forgejo-auth` secret to access Forgejo over HTTPS

## k3s API Server OIDC Configuration

Located inside the Colima VM at `/etc/rancher/k3s/config.yaml`. This is NOT in the repo — it lives in the VM.

```yaml
kube-apiserver-arg:
  - "oidc-issuer-url=https://forgejo.dev.test"
  - "oidc-client-id=<headlamp-client-id>"
  - "oidc-username-claim=preferred_username"
  - "oidc-username-prefix=-"
  - "oidc-groups-claim=groups"
  - "oidc-ca-file=/usr/local/share/ca-certificates/openplatform.crt"
```

Changes require: `colima ssh -- sudo systemctl restart k3s`

**After first deploy**, update `oidc-client-id` with the auto-generated Headlamp client ID:
```bash
kubectl get secret oidc -n headlamp -o jsonpath='{.data.OIDC_CLIENT_ID}' | base64 -d
```

### OIDC Gotchas

- **`oidc-client-id`** must match the Headlamp OAuth2 app's client ID from Forgejo. This is auto-generated by `setup-oauth2.sh` — retrieve it from the `oidc` K8s secret.
- **`oidc-username-prefix=-`** is required. Without it, the API server prepends the issuer URL to usernames (e.g., `https://forgejo.dev.test#trevato` instead of `trevato`), causing RBAC mismatches.
- **Config requires restart** — k3s only reads the config at startup. Verify: `colima ssh -- sudo journalctl -u k3s -n 50 --no-pager | grep oidc`
- **DNS inside the VM** — `forgejo.dev.test` must resolve inside the Colima VM. Check `/etc/hosts` in the VM.

## Known Quirks

- **Headlamp chart OIDC secret** — uses the `externalSecret` pattern (Option 3 in the chart). All OIDC values come from the K8s secret via `envFrom`. Keys must be uppercase with underscores (`OIDC_CLIENT_ID`, not `clientID`). The chart's Option 1 (`secret.create: false` with `secret.name`) does NOT inject client credentials.
- **Headlamp callback path** — `/oidc-callback` (not `/oidc/callback`). The redirect URI in the Forgejo OAuth2 app must match exactly.
- **Headlamp "failed to append ca cert to pool" log** — cosmetic bug. Fires when no `--oidc-ca-file` is set. The TLS skip transport handles it. Harmless.
- **Headlamp OIDC scopes** — must be comma-separated (`"openid,profile,email,groups"`), not space-separated.
- **Woodpecker server URL** — uses `http://ci.dev.test` (not https) for internal agent communication.
- **Woodpecker redirect URI** — `http://ci.dev.test/authorize` (HTTP, not HTTPS).
- **Woodpecker image builds** — must use Kaniko (not docker-buildx) with the K8s backend. `skip_tls_verify: true` for self-signed Forgejo container registry.
- **Forgejo SSH** — listens on port 2222 internally, exposed on port 22 via ingress/service.
- **Forgejo container registry** — images at `forgejo.dev.test/<owner>/<image>:<tag>`. Requires personal access token with `write:packages` scope.
- **Helmfile global hooks** — unreliable across versions. We wire all bootstrap logic into the traefik presync (first release) instead.
- **Flux + helmfile coexistence** — helmfile bootstraps releases, Flux adopts them via matching HelmReleases. Flux's helm-controller runs `helm upgrade --install` — if values match, it's a no-op. After bootstrap, Flux owns the releases.

## Development Conventions

- **Package management**: bun (JavaScript/TypeScript), uv (Python)
- **YAML style**: 2-space indentation, quoted strings for values with special characters
- **Helm values files**: named `<service>-values.yaml` (bootstrap), inlined in HelmRelease resources (Flux)
- **Platform config**: in `platform/` directory, pushed to `system/open-platform` on Forgejo
- **App templates**: in `templates/` directory, pushed to `system/template` on Forgejo
- **K8s manifests**: in `manifests/` directory (bootstrap), duplicated in `platform/` (Flux)
- **Automation scripts**: in `scripts/` directory
- **Domain convention**: `<service>.dev.test`
- **Deployment**: helmfile bootstraps, Flux manages ongoing; Makefile provides workflow targets
- **CI/CD**: Woodpecker with `.woodpecker/` directory (test.yaml for PRs, deploy.yaml for main)
