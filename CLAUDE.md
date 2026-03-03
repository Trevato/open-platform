# Open Platform — Agent Reference

Self-hosted developer platform running on k3s. VxRail (NixOS) serves as the control plane; Mac joins optionally as an agent via Colima. All services authenticate through Forgejo as the OIDC/OAuth2 identity provider. The platform is self-seeding and self-managing via Flux GitOps.

## Architecture

```
                    ┌─── Cloudflare Tunnel ───► *.product-garden.com (public)
                    │
Browser ──► Traefik (ingress) ──┬── forgejo ────► Forgejo (git, packages, OIDC provider)
                    │           ├── ci ─────────► Woodpecker (CI/CD)
                    │           ├── headlamp ───► Headlamp (K8s dashboard)
                    │           ├── minio ──────► MinIO Console
                    │           ├── s3 ─────────► MinIO S3 API
                    │           ├── oauth2 ─────► OAuth2-Proxy (preview auth)
                    │           ├── social ─────► Social App
                    │           ├── minecraft ──► Minecraft App
                    │           └── *.dev.test ─► Apps (from template)
                    │
                    └─── *.dev.test (local, self-signed TLS)

Forgejo ──► PostgreSQL (CNPG cluster, postgres namespace)
Woodpecker ──► Forgejo (SCM integration, OAuth2)
Headlamp ──► Forgejo (OIDC) ──► K8s API Server (OIDC token validation)

Flux (flux-system) ──► system/open-platform on Forgejo ──► reconciles all platform services
```

### Multi-Node Topology

| Node | Role | Runs |
|------|------|------|
| `otavert-vxrail` | k3s server (control plane) | All platform services, cloudflared, workloads |
| `colima` (Mac) | k3s agent (optional) | Additional compute capacity, pipeline pods |

VxRail runs NixOS — k3s config, CA trust, `/etc/hosts`, and firewall rules are managed declaratively via `~/nix-darwin-config/modules/nixos.nix`. Mac agent joins via `make mac-start` (Colima VM + k3s agent).

### Domain Strategy

| Domain | Scope | TLS | Routing |
|--------|-------|-----|---------|
| `*.product-garden.com` | Public (canonical) | Cloudflare edge TLS | Cloudflare Tunnel → Traefik |
| `*.dev.test` | Local / in-cluster | Self-signed CA | Direct to Traefik (CoreDNS / /etc/hosts) |

Both domains resolve to the same services. `*.product-garden.com` is canonical — Forgejo's `ROOT_URL`, Woodpecker's `WOODPECKER_HOST`, and app `BETTER_AUTH_URL` all use it. OAuth flows redirect browsers to `forgejo.product-garden.com`. Server-side token exchange uses `forgejo.dev.test` internally (via CoreDNS) to avoid hairpinning through Cloudflare.

### Cloudflare Tunnel

- **Config**: `platform/infrastructure/configs/cloudflared.yaml` (ConfigMap + Deployment)
- **Namespace**: `cloudflare`
- **Routes**: `*.product-garden.com` → `http://traefik.kube-system.svc.cluster.local`
- **Credentials**: `cloudflared-credentials` secret (created by `ensure-secrets.sh` from `.env`)
- **Node affinity**: pinned to `otavert-vxrail` via nodeSelector

### Two Deployment Models

- **Flux** manages the platform. `platform/` directory contains HelmReleases + manifests, pushed to `system/open-platform` on Forgejo. Changes auto-apply via Flux reconciliation.
- **Woodpecker CI** deploys apps. App template includes 4 workflows: deploy (main branch), preview (PR — isolated DB/bucket per PR), preview-cleanup (PR close), and reset (manual data wipe).

## Services

### Forgejo (Git + Identity Provider)
- **Config**: `platform/identity/forgejo.yaml` (Flux HelmRelease), `forgejo-values.yaml` (helmfile bootstrap)
- **Namespace**: `forgejo`
- **Domains**: `forgejo.product-garden.com` (canonical), `forgejo.dev.test` (local)
- **Helm chart**: `oci://code.forgejo.org/forgejo-helm/forgejo` (version pinned via OCIRepository semver)
- **Database**: PostgreSQL at `postgres-rw.postgres.svc.cluster.local:5432`, database `forgejo`
- **Role**: Central identity provider. All other services authenticate through Forgejo OAuth2 applications.
- **Canonical URL**: `ROOT_URL: https://forgejo.product-garden.com`. OIDC token `iss` claim uses this URL — all consumers must match.
- **Secrets**: `forgejo-admin-credentials` (admin user), `forgejo-db-config` (database password) — both referenced as existing K8s secrets
- **Features enabled**: OAuth2 provider, OpenID signin, package/container registry, LFS, organization creation
- **Webhook hosts**: `ALLOWED_HOST_LIST: "*.dev.test,*.product-garden.com"`

### Headlamp (Kubernetes Dashboard)
- **Config**: `platform/apps/headlamp.yaml` (Flux HelmRelease), `headlamp-values.yaml` (helmfile bootstrap)
- **Namespace**: `headlamp`
- **Domain**: `headlamp.dev.test`
- **Helm chart**: `headlamp/headlamp`
- **Auth**: OIDC via Forgejo using the chart's `externalSecret` pattern (Option 3). The `oidc` secret in the headlamp namespace is created by `scripts/setup-oauth2.sh` with keys: `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_ISSUER_URL`, `OIDC_SCOPES`, `OIDC_CALLBACK_URL`.
- **OIDC issuer**: `https://forgejo.product-garden.com`
- **Callback URL**: `https://headlamp.dev.test/oidc-callback`
- **TLS skip**: `HEADLAMP_CONFIG_OIDC_SKIP_TLS_VERIFY=true` env var skips TLS verification for the OIDC backchannel (required because of self-signed certs)

### Woodpecker (CI/CD)
- **Config**: `platform/apps/woodpecker.yaml` (Flux HelmRelease), `woodpecker-values.yaml` (helmfile bootstrap)
- **Namespace**: `woodpecker`
- **Domains**: `ci.product-garden.com` (canonical, `WOODPECKER_HOST`), `ci.dev.test` (local)
- **Helm chart**: `woodpecker/woodpecker`
- **Auth**: Forgejo OAuth2 integration. Redirect URI: `http://ci.dev.test/authorize`
- **Backend**: Kubernetes-native (pipelines run as pods)
- **Forgejo URL**: `WOODPECKER_FORGEJO_URL: "https://forgejo.dev.test"` (server-side, stays internal)
- **Secrets**: `woodpecker-secrets` — contains `WOODPECKER_AGENT_SECRET`, `WOODPECKER_FORGEJO_CLIENT`, `WOODPECKER_FORGEJO_SECRET`. Loaded via `extraSecretNamesForEnvFrom`.
- **RBAC**: `woodpecker-deployer` ClusterRole grants the agent and pipeline pods permissions to manage deployments, services, secrets, configmaps, pods, ingresses, jobs, namespaces, and pods/exec. `woodpecker-pipeline` ServiceAccount is used by CI deploy steps.
- **Image builds**: Uses Kaniko (woodpeckerci/plugin-kaniko) — works in K8s backend without Docker daemon. `skip_tls_verify: true` for self-signed Forgejo registry.
- **Auto-setup**: `scripts/setup-woodpecker-repos.sh` programmatically logs into Woodpecker via the Forgejo→Woodpecker OAuth2 flow (curl-based), activates repos, and creates org-level secrets. No manual UI steps required.
- **Org secrets**: `registry_username` and `registry_token` are set at the `system` org level — inherited by all repos in the org automatically. New repos from the template get CI credentials without per-repo setup.

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

### OAuth2-Proxy (Preview Auth)
- **Config**: `platform/apps/oauth2-proxy.yaml` (Flux HelmRelease), inline values in `helmfile.yaml` (bootstrap)
- **Namespace**: `oauth2-proxy`
- **Domain**: `oauth2.dev.test`
- **Helm chart**: `oauth2-proxy/oauth2-proxy`
- **Provider**: OIDC with Forgejo as issuer (`https://forgejo.product-garden.com`)
- **Role**: Protects preview environments. Traefik ForwardAuth middleware redirects unauthenticated users to Forgejo login before accessing PR preview deployments.
- **Upstream**: `static://200` — Traefik handles proxying, oauth2-proxy only validates auth
- **Cookie domains**: `.dev.test`, `.product-garden.com` — allows SSO across both domains
- **Whitelist domains**: `.dev.test`, `.product-garden.com`
- **Secrets**: `oauth2-proxy-secrets` (oauth2-proxy ns) — `client-id`, `client-secret`, `cookie-secret`. Created by `scripts/setup-oauth2.sh` (OAuth2 creds) and `scripts/ensure-secrets.sh` (cookie secret bootstrap).
- **Traefik Middleware**: `oauth2-proxy-auth` in oauth2-proxy namespace — ForwardAuth CRD pointing to `http://oauth2-proxy.oauth2-proxy.svc:4180/oauth2/auth`. Preview ingresses reference: `traefik.ingress.kubernetes.io/router.middlewares: oauth2-proxy-oauth2-proxy-auth@kubernetescrd`
- **TLS**: `ssl_insecure_skip_verify = true` for self-signed Forgejo

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
| `system/template` | App template — Next.js 15 App Router with postgres, S3/MinIO, Forgejo OAuth2 via better-auth, declarative schema, seed data, 4 Woodpecker CI workflows. Marked as template repo. |
| `system/social` | Social media app — posts feed, image uploads, Forgejo OAuth2 auth. Includes `feat/markdown-posts` PR for preview environments. Deployed at `social.product-garden.com`. |
| `system/minecraft` | Minecraft server hosting — create/start/stop/delete real Minecraft servers via K8s API. Uses `itzg/minecraft-server` pods, NodePort services, namespace-scoped RBAC. Deployed at `minecraft.product-garden.com`. |
| `system/arcade` | Arcade app — generated from template. Deployed at `arcade.product-garden.com`. (Namespaced, not yet in setup-system-org.sh) |
| `system/events` | Events app — generated from template. Deployed at `events.product-garden.com`. (Namespaced, not yet in setup-system-org.sh) |

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
| `oauth2-proxy` | OAuth2-Proxy (preview environment auth) |
| `flux-system` | Flux controllers (source, kustomize, helm, notification) |
| `cloudflare` | cloudflared tunnel pod |
| `op-system-social` | Social media app (posts, images, auth) |
| `op-system-minecraft` | Minecraft server hosting app + managed MC server pods |
| `op-system-arcade` | Arcade app |
| `op-system-events` | Events app |

## Deployment

### Bootstrap (first deploy)
```bash
cp .env.example .env        # fill in passwords + Cloudflare/k3s tokens
make deploy                 # helmfile bootstraps everything, Flux takes over
```

### Mac agent (optional)
```bash
make mac-start              # start Colima, join VxRail cluster as k3s agent
make mac-stop               # drain and stop the Mac agent
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
make urls     # show all service URLs
```

### Release Layers (Helmfile Bootstrap)
| Layer | Releases | Label |
|-------|----------|-------|
| 0 — Infrastructure | traefik, cnpg | `tier: infra` |
| 1 — Storage | minio | `tier: infra` |
| 2 — Identity | forgejo | `tier: infra` |
| 3 — Consumers | headlamp, woodpecker, oauth2-proxy | `tier: apps` |
| 4 — GitOps | flux | `tier: platform` |

### Flux Kustomization Layers (Ongoing Management)
| Layer | Resources | Path |
|-------|-----------|------|
| infra-controllers | traefik, cnpg | `platform/infrastructure/controllers/` |
| infra-configs | minio, postgres, namespaces, TLS, cloudflared | `platform/infrastructure/configs/` |
| identity | forgejo, OIDC RBAC | `platform/identity/` |
| apps | headlamp, woodpecker, oauth2-proxy, RBAC | `platform/apps/` |

Layers enforce ordering via `dependsOn`. Each uses `wait: true`.

### Hook Execution Order (Bootstrap)
1. **traefik presync**: apply `manifests/namespaces.yaml`, run `scripts/ensure-secrets.sh`, create wildcard TLS secret
2. **traefik postsync**: apply `manifests/traefik-tls.yaml` (TLSStore)
3. **cnpg postsync**: wait for operator readiness, apply `manifests/postgres-cluster.yaml`
4. **forgejo postsync**: apply `manifests/oidc-rbac.yaml`, run `scripts/setup-oauth2.sh`, run `scripts/setup-system-org.sh`
5. **woodpecker postsync**: apply `manifests/woodpecker-rbac.yaml`, run `scripts/setup-woodpecker-repos.sh`
6. **flux postsync**: run `scripts/setup-flux.sh` (GitRepository, root Kustomization, wait for reconciliation)

### Platform Config (`platform/`)
| Path | Contents |
|------|----------|
| `platform/cluster/` | Flux Kustomization resources defining layer ordering |
| `platform/infrastructure/controllers/` | HelmReleases for traefik, cnpg |
| `platform/infrastructure/configs/` | Namespaces, TLSStore, minio HelmRelease, postgres cluster, cloudflared, oauth2-proxy ForwardAuth middleware |
| `platform/identity/` | Forgejo HelmRelease (OCIRepository), OIDC RBAC |
| `platform/apps/` | Headlamp + Woodpecker HelmReleases, RBAC |

### App Template (`templates/app/`)
| Path | Contents |
|------|----------|
| `src/auth.ts` | Forgejo OAuth2 via better-auth + genericOAuth plugin (split URL pattern) |
| `src/lib/auth-client.ts` | Client-side auth (createAuthClient + genericOAuthClient) |
| `src/app/api/auth/[...all]/route.ts` | better-auth route handler via toNextJsHandler |
| `src/app/components/sign-in-button.tsx` | SignInButton + SignOutButton client components |
| `src/app/` | Next.js App Router pages, API routes, components |
| `src/lib/db.ts` | pg Pool via DATABASE_URL |
| `src/lib/s3.ts` | S3Client for MinIO |
| `Dockerfile` | Multi-stage Node 20 Alpine, Next.js standalone output |
| `package.json` | next 15, react 19, pg, @aws-sdk/client-s3, better-auth |
| `tsconfig.json` | Next.js App Router TypeScript config |
| `next.config.js` | `output: "standalone"` |
| `schema.sql` | Declarative DB schema — better-auth tables (user, session, account, verification) + app tables |
| `seed/` | SQL seed files + S3 seed data (applied in preview envs) |
| `k8s/` | Deployment (DB, S3, auth env vars), Service, Ingress (dual-domain) |
| `.woodpecker/deploy.yml` | Main branch: Kaniko build → provision → schema → deploy |
| `.woodpecker/preview.yml` | PR: build → provision → schema → seed → deploy preview → PR comment |
| `.woodpecker/preview-cleanup.yml` | PR close: delete preview resources, DB, bucket |
| `.woodpecker/reset.yml` | Manual: wipe and re-seed preview data |
| `PLATFORM.md` | Platform conventions, env vars, setup guide |

### Auth URL Pattern (Apps)
Apps use a split URL pattern for Forgejo OAuth2:
- `AUTH_FORGEJO_URL` (`https://forgejo.product-garden.com`) — browser-facing. Used for `authorizationUrl` (where the browser redirects to login).
- `AUTH_FORGEJO_INTERNAL_URL` (`https://forgejo.dev.test`) — server-side. Used for `tokenUrl` and `userInfoUrl` (pod-to-pod via CoreDNS, avoids Cloudflare hairpin).
- `BETTER_AUTH_URL` (`https://<app>.product-garden.com`) — canonical app URL for callbacks.

### Social App (`apps/social/`)
Source for `system/social` repo. Complete app (feat/markdown-posts version). `apps/social-overrides/` contains main-branch variants of `page.tsx` and `package.json` (without markdown rendering). Bootstrap creates main by overlaying overrides, then creates the feature branch with the originals and opens a PR.

### Minecraft App (`apps/minecraft/`)
Source for `system/minecraft` repo. Minecraft server hosting app — users create/start/stop/delete real Minecraft servers through a dark-themed dashboard. Key additions beyond the standard app template:
- **`src/lib/k8s.ts`** — K8s client using `@kubernetes/client-node` with `loadFromCluster()`. Creates `itzg/minecraft-server` Deployments + NodePort Services. Status polling checks readyReplicas and CrashLoopBackOff.
- **`k8s/rbac.yaml`** — Namespace-scoped ServiceAccount (`minecraft-manager`) + Role + RoleBinding granting deployments, services, pods CRUD within the minecraft namespace only.
- **`next.config.js`** — `serverExternalPackages: ["@kubernetes/client-node"]` to exclude from webpack bundling.
- **API routes** — `/api/servers` (CRUD), `/api/servers/[id]/start` (create K8s resources), `/api/servers/[id]/stop` (delete K8s resources), `/api/servers/[id]/status` (poll K8s, sync DB).
- **Server limit**: 5 per user. Resource naming: `mc-{serverId.slice(0,8)}`.

### Arcade & Events Apps (`apps/arcade/`, `apps/events/`)
Generated from the app template. Namespaces and deployment manifests ready. Not yet wired into `setup-system-org.sh` — repos will be created and pushed when activated.

### Manifests (`manifests/`)
| File | Purpose |
|------|---------|
| `namespaces.yaml` | All namespaces (workloads use `op-{org}-{repo}` convention) |
| `postgres-cluster.yaml` | CNPG Cluster resource |
| `woodpecker-rbac.yaml` | Woodpecker agent + pipeline RBAC |
| `traefik-tls.yaml` | Default TLSStore for wildcard cert |
| `oidc-rbac.yaml` | ClusterRoleBinding for OIDC user (`trevato` → `cluster-admin`) |

## Secrets Management

### Environment Variables (`.env`)
| Variable | Purpose |
|----------|---------|
| `FORGEJO_ADMIN_USER` | Forgejo admin username |
| `FORGEJO_ADMIN_PASSWORD` | Forgejo admin password |
| `FORGEJO_DB_PASSWORD` | Forgejo PostgreSQL password |
| `MINIO_ROOT_USER` | MinIO admin username |
| `MINIO_ROOT_PASSWORD` | MinIO admin password |
| `WOODPECKER_AGENT_SECRET` | Woodpecker agent↔server shared secret |
| `OAUTH2_PROXY_COOKIE_SECRET` | OAuth2-Proxy cookie encryption (auto-generated if empty) |
| `CLOUDFLARE_ACCOUNT_TAG` | Cloudflare account ID |
| `CLOUDFLARE_TUNNEL_ID` | Cloudflare tunnel UUID |
| `CLOUDFLARE_TUNNEL_SECRET` | Cloudflare tunnel credential secret |
| `K3S_SERVER` | k3s server URL for Mac agent join (e.g., `https://10.0.0.44:6443`) |
| `K3S_TOKEN` | k3s join token |
| `NODE_EXTERNAL_IP` | Mac agent external IP (Tailscale) |

### Bootstrap Secrets (from `.env`)
Created by `scripts/ensure-secrets.sh` (runs as traefik presync hook):
- `forgejo-admin-credentials` (forgejo ns) — username, password
- `forgejo-db-config` (forgejo ns) — password
- `forgejo-db-credentials` (postgres ns) — username, password (for CNPG bootstrap)
- `minio-credentials` (minio ns) — rootUser, rootPassword
- `woodpecker-secrets` (woodpecker ns) — WOODPECKER_AGENT_SECRET (preserves OAuth2 fields if they exist)
- `oauth2-proxy-secrets` (oauth2-proxy ns) — cookie-secret (auto-generated if not set)
- `cloudflared-credentials` (cloudflare ns) — tunnel credentials JSON (from CLOUDFLARE_* vars, optional)
- `platform-ca` configmap (kube-system ns) — CA cert from `certs/ca.crt` for app TLS verification

### OAuth2 Secrets (auto-generated)
Created by `scripts/setup-oauth2.sh` (runs as forgejo postsync hook):
- `oidc` (headlamp ns) — `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_ISSUER_URL`, `OIDC_SCOPES`, `OIDC_CALLBACK_URL`
- `woodpecker-secrets` (woodpecker ns) — merges `WOODPECKER_FORGEJO_CLIENT`, `WOODPECKER_FORGEJO_SECRET` into existing secret
- `oauth2-proxy-secrets` (oauth2-proxy ns) — merges `client-id`, `client-secret` into existing cookie-secret
- `social-auth` (op-system-social ns) — `client-id`, `client-secret`, `secret` (BETTER_AUTH_SECRET — preserved across PATCHes)
- `minecraft-auth` (op-system-minecraft ns) — `client-id`, `client-secret`, `secret` (BETTER_AUTH_SECRET — preserved across PATCHes)

### Flux Secrets
Created by `scripts/setup-flux.sh` (runs as flux postsync hook):
- `forgejo-auth` (flux-system ns) — admin username, password, CA cert for git access

### Scripts
| Script | Trigger | Purpose |
|--------|---------|---------|
| `scripts/ensure-secrets.sh` | traefik presync | Creates namespaces + bootstrap K8s secrets from `.env` (validates required vars) |
| `scripts/setup-oauth2.sh` | forgejo postsync | Creates OAuth2 apps via Forgejo API + K8s secrets (preserves BETTER_AUTH_SECRET) |
| `scripts/setup-system-org.sh` | forgejo postsync | Creates system org, pushes platform config + template + social + minecraft repos (uses GIT_ASKPASS for credentials) |
| `scripts/setup-woodpecker-repos.sh` | woodpecker postsync | Programmatic Woodpecker login, dynamic repo discovery + activation, org secrets — zero manual steps |
| `scripts/setup-flux.sh` | flux postsync | Creates Flux bootstrap resources (GitRepository, Kustomization) |
| `scripts/setup-oidc.sh` | after helmfile sync | Updates k3s OIDC client ID — prints NixOS instructions for VxRail, auto-updates Colima |
| `scripts/colima-start.sh` | `make mac-start` | Starts Colima, joins Mac as k3s agent to VxRail (reads K3S_SERVER/K3S_TOKEN from .env) |
| `scripts/colima-stop.sh` | `make mac-stop` | Drains and stops the Mac agent |

All scripts are idempotent — safe to run on every `make deploy`.

## TLS Setup

- Self-signed CA: `certs/ca.crt` (issuer: "OpenPlatform Local CA", valid 10 years)
- Wildcard cert: `certs/wildcard.crt` for `*.dev.test`, `dev.test`, `*.product-garden.com`, `product-garden.com`
- Private keys (`certs/*.key`) are gitignored
- The CA cert must be trusted by k3s on the server node for OIDC token validation
  - **VxRail**: deployed via NixOS `security.pki.certificateFiles` or manual placement at `/usr/local/share/ca-certificates/openplatform.crt`
  - **Colima**: `colima-start.sh` copies CA to `/etc/docker/certs.d/forgejo.dev.test/ca.crt`
- Browsers need the CA trusted to avoid certificate warnings on `*.dev.test`
- Flux source-controller uses the CA cert from `forgejo-auth` secret to access Forgejo over HTTPS

## k3s API Server OIDC Configuration

### VxRail (NixOS)
Managed declaratively in `~/nix-darwin-config/modules/nixos.nix` on VxRail:
```nix
services.k3s.extraFlags = [
  "--kube-apiserver-arg=oidc-issuer-url=https://forgejo.product-garden.com"
  "--kube-apiserver-arg=oidc-client-id=<headlamp-client-id>"
  "--kube-apiserver-arg=oidc-username-claim=preferred_username"
  "--kube-apiserver-arg=oidc-username-prefix=-"
  "--kube-apiserver-arg=oidc-groups-claim=groups"
];
```
Changes require: `ssh vxrail 'sudo nixos-rebuild switch --flake ~/nix-darwin-config#otavert-vxrail'`

### Colima (legacy single-node)
Located inside the Colima VM at `/etc/rancher/k3s/config.yaml`. Updated by `scripts/setup-oidc.sh`.

### OIDC Notes

- **`oidc-issuer-url`** must match Forgejo's `ROOT_URL` exactly: `https://forgejo.product-garden.com`
- **`oidc-client-id`** must match the Headlamp OAuth2 app's client ID. Retrieve: `kubectl get secret oidc -n headlamp -o jsonpath='{.data.OIDC_CLIENT_ID}' | base64 -d`
- **`oidc-username-prefix=-`** is required. Without it, the API server prepends the issuer URL to usernames, causing RBAC mismatches.
- **Config requires restart** — k3s only reads the config at startup.
- **DNS resolution** — the server node must resolve `forgejo.product-garden.com` to Traefik's ClusterIP (via CoreDNS or `/etc/hosts`), not hairpin through Cloudflare.

## Known Quirks

- **Headlamp chart OIDC secret** — uses the `externalSecret` pattern (Option 3 in the chart). All OIDC values come from the K8s secret via `envFrom`. Keys must be uppercase with underscores (`OIDC_CLIENT_ID`, not `clientID`). The chart's Option 1 (`secret.create: false` with `secret.name`) does NOT inject client credentials.
- **Headlamp callback path** — `/oidc-callback` (not `/oidc/callback`). The redirect URI in the Forgejo OAuth2 app must match exactly.
- **Headlamp "failed to append ca cert to pool" log** — cosmetic bug. Fires when no `--oidc-ca-file` is set. The TLS skip transport handles it. Harmless.
- **Headlamp OIDC scopes** — must be comma-separated (`"openid,profile,email,groups"`), not space-separated.
- **Woodpecker redirect URI** — `http://ci.dev.test/authorize` (HTTP, not HTTPS).
- **Woodpecker image builds** — must use Kaniko (not docker-buildx) with the K8s backend. `skip_tls_verify: true` for self-signed Forgejo container registry.
- **Forgejo SSH** — listens on port 2222 internally, exposed on port 22 via ingress/service.
- **Forgejo container registry** — images at `forgejo.dev.test/<owner>/<image>:<tag>`. Admin password works for registry auth; PATs may fail on the v2 token endpoint.
- **Forgejo webhook `ALLOWED_HOST_LIST`** — default blocks outgoing webhooks to external IPs. Set to `"*.dev.test,*.product-garden.com"`.
- **Forgejo PATCH regenerates client_secret** — updating OAuth2 app redirect URIs regenerates the secret. `setup-oauth2.sh` handles this by updating K8s secrets while preserving `BETTER_AUTH_SECRET`.
- **Kaniko `repo` value** — must NOT include the registry hostname (it's prepended from `registry` setting). Use `repo: ${CI_REPO_OWNER}/${CI_REPO_NAME}`.
- **Custom clone step** — default Woodpecker clone fails with self-signed certs. All workflows use `clone: [{name: clone, image: woodpeckerci/plugin-git, settings: {skip_verify: true}}]`.
- **Woodpecker TLS** — `WOODPECKER_FORGEJO_SKIP_VERIFY: "true"` required for server→Forgejo API communication with self-signed certs.
- **CNPG peer auth** — only `postgres` user can use local socket auth. Schema runs as postgres superuser, then GRANT ALL ON ALL TABLES/SEQUENCES to the app user.
- **CREATE DATABASE requires separate psql -c calls** — semicolons in a single `-c` run in a transaction block, but CREATE DATABASE can't run in a transaction. Split into separate kubectl exec calls.
- **kubectl run with --overrides** — don't combine `-- sh -c "..."` args with `--overrides` JSON that specifies `command/args`. Use overrides-only for minio/mc pods.
- **better-auth sign-in is POST** — `/api/auth/sign-in/oauth2` returns `{"url":"...","redirect":true}` JSON. Must use client-side `authClient.signIn.oauth2()`, not `<a href>` links.
- **better-auth callback URL** — `/api/auth/oauth2/callback/{providerId}` (e.g., `/api/auth/oauth2/callback/forgejo`).
- **better-auth env vars** — `BETTER_AUTH_SECRET` (session encryption), `BETTER_AUTH_URL` (public app URL), `AUTH_FORGEJO_URL` (browser-facing Forgejo), `AUTH_FORGEJO_INTERNAL_URL` (server-side Forgejo).
- **better-auth DB tables** — `user`, `session`, `account`, `verification` with camelCase quoted column names. Must exist before app starts (created via schema.sql in CI).
- **platform-ca configmap** — Created in `kube-system` during bootstrap from `certs/ca.crt`. CI provisioning copies it to app namespaces. Mounted at `/etc/ssl/custom/ca.crt`, referenced by `NODE_EXTRA_CA_CERTS`. Required for Node.js to verify Forgejo's self-signed TLS during OAuth flows.
- **Docker registry in k3s (Colima)** — Colima uses Docker runtime. Add CA cert to `/etc/docker/certs.d/forgejo.dev.test/ca.crt` inside VM. Also create `/etc/rancher/k3s/registries.yaml` with `insecure_skip_verify: true`. Restart both docker and k3s.
- **Helmfile global hooks** — unreliable across versions. We wire all bootstrap logic into the traefik presync (first release) instead.
- **OAuth2-Proxy redirect** — callback at `https://oauth2.dev.test/oauth2/callback`. Cookie domain covers both `.dev.test` and `.product-garden.com`.
- **Preview auth annotation** — preview ingresses use `traefik.ingress.kubernetes.io/router.middlewares: oauth2-proxy-oauth2-proxy-auth@kubernetescrd` to trigger ForwardAuth.
- **Flux + helmfile coexistence** — helmfile bootstraps releases, Flux adopts them via matching HelmReleases. Flux's helm-controller runs `helm upgrade --install` — if values match, it's a no-op. After bootstrap, Flux owns the releases. Bootstrap ↔ Flux values MUST stay in sync or Flux thrashes config on every reconciliation.
- **Git credential security** — `setup-system-org.sh` uses `GIT_ASKPASS` helper to avoid embedding passwords in git URLs (which would expose them in process listings).

## Development Conventions

- **Package management**: bun (JavaScript/TypeScript), uv (Python)
- **YAML style**: 2-space indentation, quoted strings for values with special characters
- **Helm values files**: named `<service>-values.yaml` (bootstrap), inlined in HelmRelease resources (Flux). Both MUST match.
- **Platform config**: in `platform/` directory, pushed to `system/open-platform` on Forgejo
- **App templates**: in `templates/` directory, pushed to `system/template` on Forgejo
- **K8s manifests**: in `manifests/` directory (bootstrap), duplicated in `platform/` (Flux)
- **Automation scripts**: in `scripts/` directory
- **Domain convention**: `<service>.product-garden.com` (canonical), `<service>.dev.test` (local)
- **Deployment**: helmfile bootstraps, Flux manages ongoing; Makefile provides workflow targets
- **CI/CD**: Woodpecker with `.woodpecker/` directory (deploy.yml for main, preview.yml for PRs, preview-cleanup.yml for PR close, reset.yml for manual data reset). Template changes must be synced to all apps.
