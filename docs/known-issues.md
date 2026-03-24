# Known Issues and Quirks

Implementation gotchas discovered during development. Consult when debugging unexpected behavior.

## Headlamp

- **OIDC secret pattern** — uses the `externalSecret` pattern (Option 3 in the chart). All OIDC values come from the K8s secret via `envFrom`. Keys must be uppercase with underscores (`OIDC_CLIENT_ID`, not `clientID`). The chart's Option 1 (`secret.create: false` with `secret.name`) does NOT inject client credentials.
- **Callback path** — `/oidc-callback` (not `/oidc/callback`). The redirect URI in the Forgejo OAuth2 app must match exactly.
- **OIDC scopes** — must be comma-separated, not space-separated. Do NOT include `offline_access` — Forgejo doesn't support it (not in `scopes_supported`). Using it causes "key not found" refresh token errors and auth loops. Use: `"openid,profile,email,groups"`.
- **OIDC external secret keys** — the `oidc` K8s secret MUST include `OIDC_ISSUER_URL` and `OIDC_CALLBACK_URL` in addition to `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_SCOPES`. The chart uses `$(OIDC_ISSUER_URL)` in CLI args — missing key causes literal string and immediate OIDC failure.
- **Skip TLS verify** — use `HEADLAMP_CONFIG_OIDC_SKIP_TLS_VERIFY=true` env var (NOT a CLI flag). Works correctly despite "failed to append ca cert to pool" log (non-fatal).
- **sessionTTL flag crash** — do NOT add `sessionTTL` to HelmRelease values. Chart 0.40.x passes `-session-ttl` to the binary which doesn't support the flag yet. Causes `CrashLoopBackOff`. Omitting `sessionTTL` from values works fine — the chart skips the flag. Pin chart to `version: "0.39.0"` to avoid the crash entirely.
- **OIDC state is in-memory** — Headlamp stores OIDC state in a Go in-memory map (`oauthRequestMap`). Pod restarts during active login sessions cause "invalid request state is empty" errors. This is expected — users just retry.
- **k3s OIDC must match** — k3s `--kube-apiserver-arg=oidc-issuer-url` and `oidc-client-id` MUST match Headlamp's OIDC secret. Mismatch causes silent token rejection and infinite auth loop. Update NixOS config on VxRail and rebuild after changing OAuth2 apps.
- **k3s OIDC CA cert** — k3s needs `--oidc-ca-file` pointing to the platform CA cert (`/etc/ssl/custom/openplatform-ca.crt`). Must match the CA in `certs/ca.crt`. Copy updated cert to VxRail's `~/nix-darwin-config/certs/openplatform-ca.crt` and rebuild NixOS.

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

## Jitsi

- **OIDC adapter** — uses `MarcelCoding/jitsi-openid` (Rust), NOT `nordeck/jitsi-keycloak-adapter` (Keycloak-only). The adapter runs as a sidecar in the web pod (port 3000) with a separate Service/Ingress at `meet-auth.{PLATFORM_DOMAIN}`.
- **`tokenAuthUrl`** — set via `web.extraEnvs.TOKEN_AUTH_URL` in the Helm chart. Value: `https://meet-auth.{DOMAIN}/room/{room}`. The `{room}` placeholder is replaced by Jitsi at runtime.
- **Prosody PVC persistence** — Helm upgrades regenerate XMPP passwords but Prosody's PVC retains old SCRAM-SHA-1 hashes. After any Helm upgrade, re-register accounts: `prosodyctl --config /config/prosody.cfg.lua register focus auth.meet.jitsi <JICOFO_PASS>` and same for `jvb`. Then restart Jicofo and JVB deployments.
- **XMPP secret names** — `jitsi-jitsi-meet-jicofo-secret` and `jitsi-jitsi-meet-jvb-secret` (NOT `-jicofo` or `-jvb-0`). Container name in Prosody pod is `jitsi-meet` (not `prosody`).
- **OAuth2 redirect URI** — `https://meet-auth.{DOMAIN}/callback` (jitsi-openid's callback path).
- **VERIFY_ACCESS_TOKEN_HASH** — set to `false` initially. Test if Forgejo's `id_token` includes `at_hash`; if so, set to `true` for tighter security.

## Zulip

- **OIDC per-IdP credentials** — `SOCIAL_AUTH_OIDC_KEY`/`SECRET` top-level vars are IGNORED. The `client_id` and `secret` MUST be inside the per-IdP dict in `SOCIAL_AUTH_OIDC_ENABLED_IDPS`. Use K8s `$(VAR)` env var expansion to inject from secrets.
- **`oidc_url` is the base URL** — set to `https://forgejo.{DOMAIN}`, NOT the discovery URL. The `python-social-auth` library appends `/.well-known/openid-configuration` automatically. Using the full discovery URL causes a double path and 404.
- **HTTPS redirect** — behind Cloudflare Tunnel, Traefik strips `X-Forwarded-Proto` headers (no trusted IPs). Set `SETTING_SOCIAL_AUTH_REDIRECT_IS_HTTPS: "True"` to force HTTPS redirect URIs.
- **CSRF behind proxy** — requires `SETTING_SECURE_PROXY_SSL_HEADER: "('HTTP_X_FORWARDED_PROTO', 'https')"` and `SETTING_CSRF_TRUSTED_ORIGINS: '["https://chat.{DOMAIN}"]'`.
- **Bitnami-style chart** — uses Bitnami `ingress.hostname` and `ingress.ingressClassName`, similar to Mailpit.

## Mailpit

- **Bitnami-style ingress** — uses `ingress.hostname` and `ingress.ingressClassName`, NOT `ingress.hosts[]` array with `className`.

## vCluster

- **CoreDNS port** — custom server zones must use `:1053` inside vCluster (not `:53`). vCluster's kube-dns maps 53 to 1053.
- **Traefik mode** — must be `Deployment` inside vCluster, not DaemonSet. `hostNetwork: true` is incompatible — synced pods would steal host ports.
- **Headlamp OIDC** — needs Traefik Middleware (`X-Forwarded-Proto: https`) on host cluster because host Traefik terminates TLS. Also needs API server `--oidc-*` flags via helm upgrade (Phase 7c in provision-instance.sh).
- **StatefulSet immutability** — `helm upgrade` fails if StatefulSet spec fields change (e.g., adding OIDC args). Delete StatefulSet with `--cascade=orphan` first, then upgrade.
- **Ingress sync** — ingresses sync to host namespace `vc-{slug}` with mangled names (e.g., `headlamp-x-headlamp-x-tester`). Host Traefik picks them up automatically.
