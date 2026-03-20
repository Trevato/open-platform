# Service Configuration Reference

Detailed configuration, secrets, and endpoints for each platform service. For architecture overview, see [CLAUDE.md](../CLAUDE.md).

## Forgejo (Git + Identity Provider)

| Key           | Value                                                                            |
| ------------- | -------------------------------------------------------------------------------- |
| Config        | `platform/identity/forgejo.yaml` (Flux), `forgejo-values.yaml` (helmfile)        |
| Namespace     | `forgejo`                                                                        |
| Domain        | `forgejo.{PLATFORM_DOMAIN}`                                                      |
| Helm chart    | `oci://code.forgejo.org/forgejo-helm/forgejo` (OCIRepository semver)             |
| Database      | `postgres-rw.postgres.svc.cluster.local:5432`, database `forgejo`                |
| Secrets       | `forgejo-admin-credentials` (username, password), `forgejo-db-config` (password) |
| Canonical URL | `ROOT_URL: https://forgejo.{PLATFORM_DOMAIN}` — OIDC `iss` claim uses this       |
| Features      | OAuth2 provider, OpenID signin, package/container registry, LFS, org creation    |
| Webhook hosts | `ALLOWED_HOST_LIST: "*.{PLATFORM_DOMAIN}"`                                       |

## Headlamp (Kubernetes Dashboard)

| Key          | Value                                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------ |
| Config       | `platform/apps/headlamp.yaml` (Flux), `headlamp-values.yaml` (helmfile)                                      |
| Namespace    | `headlamp`                                                                                                   |
| Domain       | `headlamp.{PLATFORM_DOMAIN}`                                                                                 |
| Helm chart   | `headlamp/headlamp`                                                                                          |
| Auth         | OIDC via Forgejo, `externalSecret` pattern (Option 3)                                                        |
| Secret       | `oidc` — keys: `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_ISSUER_URL`, `OIDC_SCOPES`, `OIDC_CALLBACK_URL` |
| OIDC issuer  | `https://forgejo.{PLATFORM_DOMAIN}`                                                                          |
| Callback URL | `https://headlamp.{PLATFORM_DOMAIN}/oidc-callback`                                                           |

## Woodpecker (CI/CD)

| Key          | Value                                                                                                                        |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Config       | `platform/apps/woodpecker.yaml` (Flux), `woodpecker-values.yaml` (helmfile)                                                  |
| Namespace    | `woodpecker`                                                                                                                 |
| Domain       | `ci.{PLATFORM_DOMAIN}`                                                                                                       |
| Helm chart   | `woodpecker/woodpecker`                                                                                                      |
| Auth         | Forgejo OAuth2. Redirect URI: `https://ci.{PLATFORM_DOMAIN}/authorize`                                                       |
| Backend      | Kubernetes-native (pipelines run as pods)                                                                                    |
| Forgejo URL  | `WOODPECKER_FORGEJO_URL: "https://forgejo.{PLATFORM_DOMAIN}"`                                                                |
| Secret       | `woodpecker-secrets` — `WOODPECKER_AGENT_SECRET`, `WOODPECKER_FORGEJO_CLIENT`, `WOODPECKER_FORGEJO_SECRET`                   |
| RBAC         | `woodpecker-deployer` ClusterRole — deployments, services, secrets, configmaps, pods, ingresses, jobs, namespaces, pods/exec |
| Image builds | Kaniko (`woodpeckerci/plugin-kaniko`), cache enabled                                                                         |
| Auto-setup   | `setup-woodpecker-repos.sh` — programmatic login, repo activation, org secrets                                               |
| Org secrets  | `registry_username`, `registry_token`, `platform_domain`, `registry_host` (system org level)                                 |

## MinIO (Object Storage)

| Key        | Value                                                                               |
| ---------- | ----------------------------------------------------------------------------------- |
| Config     | `platform/infrastructure/configs/minio.yaml` (Flux), `minio-values.yaml` (helmfile) |
| Namespace  | `minio`                                                                             |
| Domains    | `minio.{PLATFORM_DOMAIN}` (console), `s3.{PLATFORM_DOMAIN}` (S3 API)                |
| Helm chart | `minio/minio`                                                                       |
| Mode       | standalone, 20Gi storage                                                            |
| Secret     | `minio-credentials` — rootUser, rootPassword                                        |

## PostgreSQL (CNPG)

| Key             | Value                                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------ |
| Config          | `platform/infrastructure/configs/postgres-cluster.yaml` (Flux), `manifests/postgres-cluster.yaml` (helmfile) |
| Namespace       | `postgres`                                                                                                   |
| Access          | `postgres-rw.postgres.svc.cluster.local:5432`                                                                |
| Instances       | 1 (non-HA)                                                                                                   |
| Databases       | `forgejo`, `platform_ledger`, `product_garden`                                                               |
| Resources       | 256Mi-1Gi memory, 100m-1000m CPU, 10Gi storage                                                               |
| Max connections | 200                                                                                                          |

## OAuth2-Proxy (Preview Auth)

| Key                | Value                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------------- |
| Config             | `platform/apps/oauth2-proxy.yaml` (Flux), inline in `helmfile.yaml` (helmfile)               |
| Namespace          | `oauth2-proxy`                                                                               |
| Domain             | `oauth2.{PLATFORM_DOMAIN}`                                                                   |
| Helm chart         | `oauth2-proxy/oauth2-proxy`                                                                  |
| Provider           | OIDC with Forgejo (`https://forgejo.{PLATFORM_DOMAIN}`)                                      |
| Role               | Protects preview environments via Traefik ForwardAuth                                        |
| Upstream           | `static://200` (Traefik proxies, oauth2-proxy validates auth only)                           |
| Cookie domain      | `.{PLATFORM_DOMAIN}`                                                                         |
| Secret             | `oauth2-proxy-secrets` — `client-id`, `client-secret`, `cookie-secret`                       |
| Traefik Middleware | `oauth2-proxy-auth` — ForwardAuth to `http://oauth2-proxy.oauth2-proxy.svc:4180/oauth2/auth` |
| TLS                | self-signed: `ssl_insecure_skip_verify = true`; cloudflare: real TLS                         |

## Flux (GitOps)

| Key        | Value                                                                              |
| ---------- | ---------------------------------------------------------------------------------- |
| Config     | `helmfile.yaml` (bootstrap), `scripts/setup-flux.sh`                               |
| Namespace  | `flux-system`                                                                      |
| Helm chart | `fluxcd-community/flux2`                                                           |
| Role       | Watches `system/open-platform` on Forgejo, reconciles all HelmReleases + manifests |
| Secret     | `forgejo-auth` (flux-system ns) — admin credentials for git access                 |

## Environment Variables (`.env`)

| Variable                     | Purpose                                                |
| ---------------------------- | ------------------------------------------------------ |
| `PLATFORM_DOMAIN`            | Platform domain (from `open-platform.yaml`)            |
| `FORGEJO_ADMIN_USER`         | Forgejo admin username                                 |
| `FORGEJO_ADMIN_PASSWORD`     | Forgejo admin password (auto-generated)                |
| `FORGEJO_DB_PASSWORD`        | Forgejo PostgreSQL password (auto-generated)           |
| `MINIO_ROOT_USER`            | MinIO admin username                                   |
| `MINIO_ROOT_PASSWORD`        | MinIO admin password (auto-generated)                  |
| `WOODPECKER_AGENT_SECRET`    | Woodpecker agent-server shared secret (auto-generated) |
| `OAUTH2_PROXY_COOKIE_SECRET` | OAuth2-Proxy cookie encryption (auto-generated)        |
| `BETTER_AUTH_SECRET`         | App session encryption key (auto-generated)            |
| `CLOUDFLARE_ACCOUNT_TAG`     | Cloudflare account ID (optional)                       |
| `CLOUDFLARE_TUNNEL_ID`       | Cloudflare tunnel UUID (optional)                      |
| `CLOUDFLARE_TUNNEL_SECRET`   | Cloudflare tunnel credential secret (optional)         |

## Bootstrap Secrets

Created by `scripts/ensure-secrets.sh` (traefik presync hook):

- `forgejo-admin-credentials` (forgejo ns) — username, password
- `forgejo-db-config` (forgejo ns) — password
- `forgejo-db-credentials` (postgres ns) — username, password (for CNPG bootstrap)
- `minio-credentials` (minio ns) — rootUser, rootPassword
- `woodpecker-secrets` (woodpecker ns) — WOODPECKER_AGENT_SECRET (preserves OAuth2 fields)
- `oauth2-proxy-secrets` (oauth2-proxy ns) — cookie-secret (auto-generated if not set)
- `cloudflared-credentials` (cloudflare ns) — tunnel credentials JSON (optional)

## OAuth2 Secrets

Created by `scripts/setup-oauth2.sh` (forgejo postsync hook):

- `oidc` (headlamp ns) — OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, OIDC_ISSUER_URL, OIDC_SCOPES, OIDC_CALLBACK_URL
- `woodpecker-secrets` (woodpecker ns) — merges WOODPECKER_FORGEJO_CLIENT, WOODPECKER_FORGEJO_SECRET
- `oauth2-proxy-secrets` (oauth2-proxy ns) — merges client-id, client-secret
- `social-auth` (op-system-social ns) — client-id, client-secret, secret (BETTER_AUTH_SECRET preserved)
- `minecraft-auth` (op-system-minecraft ns) — client-id, client-secret, secret (BETTER_AUTH_SECRET preserved)

## Flux Secrets

Created by `scripts/setup-flux.sh` (flux postsync hook):

- `forgejo-auth` (flux-system ns) — admin username, password for git access
