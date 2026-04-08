# Bootstrap and Deployment Details

Deep reference for the platform deployment pipeline, template system, and example apps.

## Platform Config (`platform/`)

| Path                                   | Contents                                                                                       |
| -------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `platform/cluster/`                    | Flux Kustomization resources defining layer ordering                                           |
| `platform/infrastructure/controllers/` | HelmReleases for traefik, cnpg                                                                 |
| `platform/infrastructure/configs/`     | Namespaces, TLSStore, minio HelmRelease, postgres cluster, oauth2-proxy ForwardAuth middleware |
| `platform/identity/`                   | Forgejo HelmRelease (OCIRepository), OIDC RBAC                                                 |
| `platform/apps/`                       | Headlamp + Woodpecker HelmReleases, RBAC                                                       |

## App Template (`templates/app/`)

| Path                                    | Contents                                                                                           |
| --------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `src/auth.ts`                           | Forgejo OAuth2 via better-auth + genericOAuth plugin                                               |
| `src/lib/auth-client.ts`                | Client-side auth (createAuthClient + genericOAuthClient)                                           |
| `src/app/api/auth/[...all]/route.ts`    | better-auth route handler via toNextJsHandler                                                      |
| `src/app/components/sign-in-button.tsx` | SignInButton + SignOutButton client components                                                     |
| `src/app/`                              | Next.js App Router pages, API routes, components                                                   |
| `src/lib/db.ts`                         | pg Pool via DATABASE_URL                                                                           |
| `src/lib/s3.ts`                         | S3Client for MinIO                                                                                 |
| `Dockerfile`                            | Multi-stage Node 20 Alpine, Next.js standalone output                                              |
| `package.json`                          | next 15, react 19, pg, @aws-sdk/client-s3, better-auth                                             |
| `tsconfig.json`                         | Next.js App Router TypeScript config                                                               |
| `next.config.js`                        | `output: "standalone"`                                                                             |
| `schema.sql`                            | Declarative DB schema — better-auth tables (user, session, account, verification) + app tables     |
| `seed/`                                 | SQL seed files + S3 seed data (applied in preview envs)                                            |
| `k8s/`                                  | Deployment (DB, S3, auth env vars), Service, Ingress (`PLATFORM_DOMAIN` placeholder)               |
| `.woodpecker/deploy.yml`                | Main branch: Kaniko build, provision, schema, typecheck, deploy                                    |
| `.woodpecker/preview.yml`               | PR: build, provision, schema, seed (`_seed_marker` pattern), typecheck, deploy preview, PR comment |
| `.woodpecker/preview-cleanup.yml`       | PR close: delete preview resources, DB, bucket                                                     |
| `.woodpecker/reset.yml`                 | Manual: wipe and re-seed preview data                                                              |
| `PLATFORM.md`                           | Platform conventions, env vars, setup guide                                                        |

## Auth URL Pattern (Apps)

Apps use Forgejo OAuth2 via better-auth:

- `AUTH_FORGEJO_URL` (`https://forgejo.{PLATFORM_DOMAIN}`) — browser-facing `authorizationUrl` and server-side `tokenUrl`/`userInfoUrl`.
- `BETTER_AUTH_URL` (`https://{app}.{PLATFORM_DOMAIN}`) — canonical app URL for callbacks.

## Example Apps

### Social (`apps/social/`)

Source for `system/social` repo. Complete app with posts feed, image uploads, Forgejo OAuth2 auth. `apps/social-overrides/` contains main-branch variants of `page.tsx` and `package.json` (without markdown rendering). Bootstrap creates main by overlaying overrides, then creates the `feat/markdown-posts` feature branch with the originals and opens a PR.

### Minecraft (`apps/minecraft/`)

Source for `system/minecraft` repo. Minecraft server hosting through a dark-themed dashboard.

- **`src/lib/k8s.ts`** — K8s client via `@kubernetes/client-node` with `loadFromCluster()`. Creates `itzg/minecraft-server` Deployments + NodePort Services.
- **`k8s/rbac.yaml`** — Namespace-scoped ServiceAccount (`minecraft-manager`) + Role + RoleBinding.
- **`next.config.js`** — `serverExternalPackages: ["@kubernetes/client-node"]`
- **API routes** — `/api/servers` (CRUD), `/api/servers/[id]/start|stop|status`
- **Server limit**: 5 per user. Resource naming: `mc-{serverId.slice(0,8)}`.

### Arcade and Events (`apps/arcade/`, `apps/events/`)

Generated from the app template. Created by `setup-system-org.sh` and deployed via Woodpecker CI.

## Manifests (`manifests/`)

| File                    | Purpose                                                     |
| ----------------------- | ----------------------------------------------------------- |
| `namespaces.yaml`       | All namespaces (workloads use `op-{org}-{repo}` convention) |
| `postgres-cluster.yaml` | CNPG Cluster resource                                       |
| `woodpecker-rbac.yaml`  | Woodpecker agent + pipeline RBAC                            |
| `traefik-tls.yaml`      | Default TLSStore for wildcard cert                          |
| `oidc-rbac.yaml`        | ClusterRoleBinding for OIDC admin user (generated)          |

## Scripts

| Script                              | Trigger                   | Purpose                                                          |
| ----------------------------------- | ------------------------- | ---------------------------------------------------------------- |
| `scripts/generate-config.sh`        | `make generate` / Phase 0 | Generates all config files from `open-platform.yaml` + templates |
| `scripts/ensure-secrets.sh`         | traefik presync           | Creates namespaces + bootstrap K8s secrets from `.env`           |
| `scripts/setup-coredns.sh`          | traefik postsync          | CoreDNS custom zone: `*.{DOMAIN}` to Traefik IP                  |
| `scripts/setup-oauth2.sh`           | forgejo postsync          | Creates OAuth2 apps via Forgejo API + K8s secrets                |
| `scripts/setup-system-org.sh`       | forgejo postsync          | Creates system org, pushes all system repos                      |
| `scripts/setup-woodpecker-repos.sh` | woodpecker postsync       | Programmatic Woodpecker login, repo activation, org secrets      |
| `scripts/setup-flux.sh`             | flux postsync             | Creates Flux bootstrap resources (GitRepository, Kustomization)  |
| `scripts/setup-oidc.sh`             | after helmfile sync       | Updates k3s OIDC client ID                                       |

All scripts are idempotent — safe to run on every `make deploy`.
