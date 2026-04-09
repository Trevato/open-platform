# Service Configuration Reference

Detailed configuration, secrets, and endpoints for each platform service. For architecture overview, see [CLAUDE.md](../CLAUDE.md).

## Forgejo (Git + Identity Provider)

| Key           | Value                                                                            |
| ------------- | -------------------------------------------------------------------------------- |
| Config        | `platform/identity/forgejo.yaml` (Flux HelmRelease)                              |
| Namespace     | `forgejo`                                                                        |
| Domain        | `forgejo.{PLATFORM_DOMAIN}`                                                      |
| Helm chart    | `oci://code.forgejo.org/forgejo-helm/forgejo` (OCIRepository semver)             |
| Database      | `postgres-rw.postgres.svc.cluster.local:5432`, database `forgejo`                |
| Secrets       | `forgejo-admin-credentials` (username, password), `forgejo-db-config` (password) |
| Canonical URL | `ROOT_URL: https://forgejo.{PLATFORM_DOMAIN}` — OIDC `iss` claim uses this       |
| Features      | OAuth2 provider, OpenID signin, package/container registry, LFS, org creation    |
| Webhook hosts | `ALLOWED_HOST_LIST: "*.{PLATFORM_DOMAIN}"`                                       |

## Woodpecker (CI/CD)

| Key          | Value                                                                                                                        |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Config       | `platform/apps/woodpecker.yaml` (Flux HelmRelease)                                                                           |
| Namespace    | `woodpecker`                                                                                                                 |
| Domain       | `ci.{PLATFORM_DOMAIN}`                                                                                                       |
| Helm chart   | `woodpecker/woodpecker`                                                                                                      |
| Auth         | Forgejo OAuth2. Redirect URI: `https://ci.{PLATFORM_DOMAIN}/authorize`                                                       |
| Backend      | Kubernetes-native (pipelines run as pods)                                                                                    |
| Forgejo URL  | `WOODPECKER_FORGEJO_URL: "https://forgejo.{PLATFORM_DOMAIN}"`                                                                |
| Secret       | `woodpecker-secrets` — `WOODPECKER_AGENT_SECRET`, `WOODPECKER_FORGEJO_CLIENT`, `WOODPECKER_FORGEJO_SECRET`                   |
| RBAC         | `woodpecker-deployer` ClusterRole — deployments, services, secrets, configmaps, pods, ingresses, jobs, namespaces, pods/exec |
| Image builds | Kaniko (`woodpeckerci/plugin-kaniko`), cache enabled                                                                         |
| Auto-setup   | Bootstrap Job — programmatic login, repo activation, org secrets                                                             |
| Org secrets  | `registry_username`, `registry_token`, `platform_domain`, `registry_host` (system org level)                                 |

## MinIO (Object Storage)

| Key        | Value                                                                |
| ---------- | -------------------------------------------------------------------- |
| Config     | `platform/infrastructure/configs/minio.yaml` (Flux HelmRelease)      |
| Namespace  | `minio`                                                              |
| Domains    | `minio.{PLATFORM_DOMAIN}` (console), `s3.{PLATFORM_DOMAIN}` (S3 API) |
| Helm chart | `minio/minio`                                                        |
| Mode       | standalone, 20Gi storage                                             |
| Secret     | `minio-credentials` — rootUser, rootPassword                         |

## PostgreSQL (CNPG)

| Key             | Value                                                          |
| --------------- | -------------------------------------------------------------- |
| Config          | `platform/infrastructure/configs/postgres-cluster.yaml` (Flux) |
| Namespace       | `postgres`                                                     |
| Access          | `postgres-rw.postgres.svc.cluster.local:5432`                  |
| Instances       | 1 (non-HA)                                                     |
| Databases       | `forgejo`, `platform_ledger`, `product_garden`                 |
| Resources       | 256Mi-1Gi memory, 100m-1000m CPU, 10Gi storage                 |
| Max connections | 200                                                            |

## OAuth2-Proxy (Preview Auth)

| Key                | Value                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------------- |
| Config             | `platform/apps/oauth2-proxy.yaml` (Flux HelmRelease)                                         |
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
| Config     | Installed by Helm chart, bootstrap Job creates GitRepository + Kustomization       |
| Namespace  | `flux-system`                                                                      |
| Helm chart | `fluxcd-community/flux2`                                                           |
| Role       | Watches `system/open-platform` on Forgejo, reconciles all HelmReleases + manifests |
| Secret     | `forgejo-auth` (flux-system ns) — admin credentials for git access                 |

## Secrets Inventory

All secrets are managed by the Helm chart (`lookup` for persistence) and the bootstrap Job (for OAuth2 and Flux setup). Auto-generated on first install, preserved across upgrades.

### Infrastructure Secrets (Helm templates)

- `forgejo-admin-credentials` (forgejo ns) — username, password
- `forgejo-db-config` (forgejo ns) — password
- `forgejo-db-credentials` (postgres ns) — username, password (for CNPG bootstrap)
- `minio-credentials` (minio ns) — rootUser, rootPassword
- `woodpecker-secrets` (woodpecker ns) — WOODPECKER_AGENT_SECRET
- `oauth2-proxy-secrets` (oauth2-proxy ns) — cookie-secret
- `cloudflared-credentials` (cloudflare ns) — tunnel credentials JSON (optional)

### OAuth2 Secrets (bootstrap Job)

- `woodpecker-secrets` (woodpecker ns) — merges WOODPECKER_FORGEJO_CLIENT, WOODPECKER_FORGEJO_SECRET
- `oauth2-proxy-secrets` (oauth2-proxy ns) — merges client-id, client-secret
- Per-app auth secrets — client-id, client-secret, secret (BETTER_AUTH_SECRET)

### Flux Secrets (bootstrap Job)

- `forgejo-auth` (flux-system ns) — admin username, password for git access
