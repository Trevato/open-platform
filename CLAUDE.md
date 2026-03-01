# Open Platform — Agent Reference

Self-hosted developer platform running on k3s (via Colima) on macOS. All services authenticate through Forgejo as the OIDC/OAuth2 identity provider.

## Architecture

```
Browser ──► Traefik (ingress) ──┬── forgejo.dev.test ──► Forgejo (git, packages, OIDC provider)
                                ├── ci.dev.test ──────► Woodpecker (CI/CD)
                                ├── headlamp.dev.test ─► Headlamp (K8s dashboard)
                                ├── minio.dev.test ───► MinIO Console
                                └── s3.dev.test ──────► MinIO S3 API

Forgejo ──► PostgreSQL (CNPG cluster, postgres namespace)
Woodpecker ──► Forgejo (SCM integration, OAuth2)
Headlamp ──► Forgejo (OIDC) ──► K8s API Server (OIDC token validation)
```

## Services

### Forgejo (Git + Identity Provider)
- **Config**: `forgejo-values.yaml`
- **Namespace**: `forgejo`
- **Domain**: `forgejo.dev.test`
- **Helm chart**: `oci://code.forgejo.org/forgejo-helm/forgejo` (version pinned in helmfile)
- **Database**: PostgreSQL at `postgres-rw.postgres.svc.cluster.local:5432`, database `forgejo`
- **Role**: Central identity provider. All other services authenticate through Forgejo OAuth2 applications.
- **Secrets**: `forgejo-admin-credentials` (admin user), `forgejo-db-config` (database password) — both referenced as existing K8s secrets
- **Features enabled**: OAuth2 provider, OpenID signin, package registry, LFS, organization creation

### Headlamp (Kubernetes Dashboard)
- **Config**: `headlamp-values.yaml`
- **Namespace**: `headlamp`
- **Domain**: `headlamp.dev.test`
- **Helm chart**: `headlamp/headlamp`
- **Auth**: OIDC via Forgejo using the chart's `externalSecret` pattern (Option 3). The `oidc` secret in the headlamp namespace is created by `scripts/setup-oauth2.sh` with keys: `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_ISSUER_URL`, `OIDC_SCOPES`, `OIDC_CALLBACK_URL`.
- **Callback URL**: `https://headlamp.dev.test/oidc-callback`
- **TLS skip**: `HEADLAMP_CONFIG_OIDC_SKIP_TLS_VERIFY=true` env var skips TLS verification for the OIDC backchannel (required because of self-signed certs)

### Woodpecker (CI/CD)
- **Config**: `woodpecker-values.yaml`, `manifests/woodpecker-rbac.yaml`
- **Namespace**: `woodpecker`
- **Domain**: `ci.dev.test`
- **Helm chart**: `woodpecker/woodpecker`
- **Auth**: Forgejo OAuth2 integration. Redirect URI: `http://ci.dev.test/authorize`
- **Backend**: Kubernetes-native (pipelines run as pods)
- **Secrets**: `woodpecker-secrets` — contains `WOODPECKER_AGENT_SECRET`, `WOODPECKER_FORGEJO_CLIENT`, `WOODPECKER_FORGEJO_SECRET`. Loaded via `extraSecretNamesForEnvFrom`.
- **RBAC**: `woodpecker-deployer` ClusterRole grants the agent permissions to manage deployments, services, secrets, pods, ingresses, and jobs

### MinIO (Object Storage)
- **Config**: `minio-values.yaml`
- **Namespace**: `minio`
- **Domains**: `minio.dev.test` (console), `s3.dev.test` (S3 API)
- **Helm chart**: `minio/minio`
- **Mode**: standalone, 20Gi storage
- **Secrets**: `minio-credentials` (rootUser, rootPassword)

### PostgreSQL (CNPG)
- **Config**: `manifests/postgres-cluster.yaml`
- **Namespace**: `postgres`
- **Access**: `postgres-rw.postgres.svc.cluster.local:5432`
- **Instances**: 1 (non-HA, dev environment)
- **Databases**: `forgejo`, `platform_ledger`, `product_garden`
- **Resources**: 256Mi–1Gi memory, 100m–1000m CPU, 10Gi storage
- **Max connections**: 200

## Namespace Layout

| Namespace | Services |
|-----------|----------|
| `kube-system` | Traefik, CoreDNS, metrics-server |
| `cnpg-system` | CNPG operator |
| `postgres` | PostgreSQL cluster |
| `forgejo` | Forgejo |
| `headlamp` | Headlamp |
| `woodpecker` | Woodpecker server + agent |
| `minio` | MinIO |

## Deployment (Helmfile)

All releases are orchestrated by `helmfile.yaml` with dependency ordering via `needs:`. Raw K8s manifests live in `manifests/` and are applied via hooks.

### Deploy
```bash
cp .env.example .env        # fill in passwords
make deploy                 # everything — secrets, services, OAuth2 apps
```

### Day-to-Day
```bash
make deploy   # idempotent helmfile sync
make diff     # preview changes
make status   # check release status
```

### Release Layers
| Layer | Releases | Label |
|-------|----------|-------|
| 0 — Infrastructure | traefik, cnpg | `tier: infra` |
| 1 — Storage | minio | `tier: infra` |
| 2 — Identity | forgejo | `tier: infra` |
| 3 — Consumers | headlamp, woodpecker | `tier: apps` |

### Hook Execution Order
1. **traefik presync**: apply `manifests/namespaces.yaml`, run `scripts/ensure-secrets.sh`, create wildcard TLS secret
2. **traefik postsync**: apply `manifests/traefik-tls.yaml` (TLSStore)
3. **cnpg postsync**: wait for operator readiness, apply `manifests/postgres-cluster.yaml`
4. **forgejo postsync**: apply `manifests/oidc-rbac.yaml`, run `scripts/setup-oauth2.sh`
5. **woodpecker postsync**: apply `manifests/woodpecker-rbac.yaml`

### Manifests (`manifests/`)
| File | Purpose |
|------|---------|
| `namespaces.yaml` | All user-created namespaces |
| `postgres-cluster.yaml` | CNPG Cluster resource |
| `woodpecker-rbac.yaml` | Woodpecker agent RBAC |
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

OAuth2 apps are registered in Forgejo via `POST /api/v1/user/applications/oauth2`. Credentials go directly from the API response into K8s secrets — they never touch `.env` or disk.

### Scripts
| Script | Trigger | Purpose |
|--------|---------|---------|
| `scripts/ensure-secrets.sh` | traefik presync | Creates namespaces + bootstrap K8s secrets from `.env` |
| `scripts/setup-oauth2.sh` | forgejo postsync | Creates OAuth2 apps via Forgejo API + K8s secrets |

Both scripts are idempotent — safe to run on every `make deploy`.

## TLS Setup

- Self-signed CA: `certs/ca.crt` (issuer: "OpenPlatform Local CA", valid 10 years)
- Wildcard cert: `certs/wildcard.crt` for `*.dev.test` and `dev.test`
- Private keys (`ca.key`, `wildcard.key`) are gitignored
- The CA cert must be installed inside the Colima VM at `/usr/local/share/ca-certificates/openplatform.crt` for the k3s API server to validate Forgejo's OIDC tokens
- Browsers need the CA trusted to avoid certificate warnings

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
- **Forgejo SSH** — listens on port 2222 internally, exposed on port 22 via ingress/service.
- **Helmfile global hooks** — unreliable across versions. We wire all bootstrap logic into the traefik presync (first release) instead.

## Development Conventions

- **Package management**: bun (JavaScript/TypeScript), uv (Python)
- **YAML style**: 2-space indentation, quoted strings for values with special characters
- **Helm values files**: named `<service>-values.yaml`
- **K8s manifests**: in `manifests/` directory
- **Automation scripts**: in `scripts/` directory
- **Domain convention**: `<service>.dev.test`
- **Deployment**: `helmfile.yaml` orchestrates all releases; `Makefile` provides workflow targets
