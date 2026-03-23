# Known Issues and Quirks

Implementation gotchas discovered during development. Consult when debugging unexpected behavior.

## Headlamp

- **OIDC secret pattern** — uses the `externalSecret` pattern (Option 3 in the chart). All OIDC values come from the K8s secret via `envFrom`. Keys must be uppercase with underscores (`OIDC_CLIENT_ID`, not `clientID`). The chart's Option 1 (`secret.create: false` with `secret.name`) does NOT inject client credentials.
- **Callback path** — `/oidc-callback` (not `/oidc/callback`). The redirect URI in the Forgejo OAuth2 app must match exactly.
- **OIDC scopes** — must be comma-separated, not space-separated. Include `offline_access` for token refresh.
- **Skip TLS verify** — use `HEADLAMP_CONFIG_OIDC_SKIP_TLS_VERIFY=true` env var (NOT a CLI flag). Works correctly despite "failed to append ca cert to pool" log (non-fatal).
- **sessionTTL flag crash** — do NOT add `sessionTTL` to HelmRelease values. Chart 0.40.x passes `-session-ttl` to the binary which doesn't support the flag yet. Causes `CrashLoopBackOff`. Omitting `sessionTTL` from values works fine — the chart skips the flag. Pin chart to `version: "0.39.0"` to avoid the crash entirely.
- **OIDC scopes** — include `offline_access` for refresh tokens: `"openid,profile,email,groups,offline_access"`.

## Woodpecker

- **Redirect URI** — `https://ci.{PLATFORM_DOMAIN}/authorize`.
- **Image builds** — must use Kaniko (not docker-buildx) with the K8s backend. Kaniko cache enabled for faster rebuilds.
- **Pipeline trigger uses numeric repo ID** — `POST /api/repos/{id}/pipelines` (not `owner/repo` path). Bearer token returns HTML for name-based paths.
- **API token scope** — GET requests work with Bearer token on any URL. POST requires the public domain (WOODPECKER_HOST) or numeric repo ID on internal URL.

## Forgejo

- **SSH** — listens on port 2222 internally, exposed on port 22 via ingress/service.
- **Container registry** — images at `forgejo.{PLATFORM_DOMAIN}/<owner>/<image>:<tag>`. Admin password works for registry auth; PATs may fail on the v2 token endpoint.
- **Webhook `ALLOWED_HOST_LIST`** — default blocks outgoing webhooks to external IPs. Set to `"*.{PLATFORM_DOMAIN}"`.
- **PATCH regenerates client_secret** — updating OAuth2 app redirect URIs regenerates the secret. `setup-oauth2.sh` handles this by updating K8s secrets while preserving `BETTER_AUTH_SECRET`.
- **Team creation needs `units`** — `POST /api/v1/orgs/{org}/teams` requires `"units": ["repo.code", "repo.issues", "repo.pulls", ...]` — omitting it returns "units permission should not be empty".

## Kaniko

- **`repo` value** — must NOT include the registry hostname (it's prepended from `registry` setting). Use `repo: ${CI_REPO_OWNER}/${CI_REPO_NAME}`.

## PostgreSQL (CNPG)

- **Peer auth** — only `postgres` user can use local socket auth. Schema runs as postgres superuser, then GRANT ALL ON ALL TABLES/SEQUENCES to the app user.
- **CREATE DATABASE requires separate psql -c calls** — semicolons in a single `-c` run in a transaction block, but CREATE DATABASE can't run in a transaction. Split into separate kubectl exec calls.

## kubectl

- **`--overrides` with args** — don't combine `-- sh -c "..."` args with `--overrides` JSON that specifies `command/args`. Use overrides-only for minio/mc pods.

## better-auth

- **Sign-in is POST** — `/api/auth/sign-in/oauth2` returns `{"url":"...","redirect":true}` JSON. Must use client-side `authClient.signIn.oauth2()`, not `<a href>` links.
- **Callback URL** — `/api/auth/oauth2/callback/{providerId}` (e.g., `/api/auth/oauth2/callback/forgejo`).
- **Env vars** — `BETTER_AUTH_SECRET` (session encryption), `BETTER_AUTH_URL` (public app URL), `AUTH_FORGEJO_URL` (Forgejo URL for OAuth2).
- **DB tables** — `user`, `session`, `account`, `verification` with camelCase quoted column names. Must exist before app starts (created via schema.sql in CI).

## Helmfile

- **Global hooks** — unreliable across versions. We wire all bootstrap logic into the traefik presync (first release) instead.

## OAuth2-Proxy

- **Redirect** — callback at `https://oauth2.{PLATFORM_DOMAIN}/oauth2/callback`. Cookie domain: `.{PLATFORM_DOMAIN}`.
- **Preview auth annotation** — preview ingresses use `traefik.ingress.kubernetes.io/router.middlewares: oauth2-proxy-oauth2-proxy-auth@kubernetescrd` to trigger ForwardAuth.

## Flux

- **Flux + helmfile coexistence** — helmfile bootstraps releases, Flux adopts them via matching HelmReleases. Flux's helm-controller runs `helm upgrade --install` — if values match, it's a no-op. After bootstrap, Flux owns the releases. Bootstrap and Flux values MUST stay in sync or Flux thrashes config on every reconciliation.

## Git

- **Credential security** — `setup-system-org.sh` uses `GIT_ASKPASS` helper to avoid embedding passwords in git URLs (which would expose them in process listings).

## vCluster

- **CoreDNS port** — custom server zones must use `:1053` inside vCluster (not `:53`). vCluster's kube-dns maps 53 to 1053.
- **Traefik mode** — must be `Deployment` inside vCluster, not DaemonSet. `hostNetwork: true` is incompatible — synced pods would steal host ports.
- **Headlamp OIDC** — needs Traefik Middleware (`X-Forwarded-Proto: https`) on host cluster because host Traefik terminates TLS. Also needs API server `--oidc-*` flags via helm upgrade (Phase 7c in provision-instance.sh).
- **StatefulSet immutability** — `helm upgrade` fails if StatefulSet spec fields change (e.g., adding OIDC args). Delete StatefulSet with `--cascade=orphan` first, then upgrade.
- **Ingress sync** — ingresses sync to host namespace `vc-{slug}` with mangled names (e.g., `headlamp-x-headlamp-x-tester`). Host Traefik picks them up automatically.
