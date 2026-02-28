# Open Platform — Agent Reference

Self-hosted developer platform running on k3s (via Colima) on macOS. All services authenticate through Forgejo as the OIDC/OAuth2 identity provider.

## Architecture

```
Browser ──► Traefik (ingress) ──┬── forgejo.dev.test ──► Forgejo (git, packages, OIDC provider)
                                ├── ci.dev.test ──────► Woodpecker (CI/CD)
                                └── headlamp.dev.test ─► Headlamp (K8s dashboard)

Forgejo ──► PostgreSQL (CNPG cluster, postgres namespace)
Woodpecker ──► Forgejo (SCM integration, OAuth2)
Headlamp ──► Forgejo (OIDC) ──► K8s API Server (OIDC token validation)
```

## Services

### Forgejo (Git + Identity Provider)
- **Config**: `forgejo-values.yaml`
- **Namespace**: `forgejo`
- **Domain**: `forgejo.dev.test`
- **Helm chart**: `forgejo/forgejo`
- **Database**: PostgreSQL at `postgres-rw.postgres.svc.cluster.local:5432`, database `forgejo`
- **Role**: Central identity provider. All other services authenticate through Forgejo OAuth2 applications.
- **Secrets**: `forgejo-admin-credentials` (admin user), `forgejo-db-config` (database password) — both referenced as existing K8s secrets, not inline
- **Features enabled**: OAuth2 provider, OpenID signin, package registry, LFS, organization creation

### Headlamp (Kubernetes Dashboard)
- **Config**: `headlamp-values.yaml`
- **Namespace**: `headlamp`
- **Domain**: `headlamp.dev.test`
- **Helm chart**: `headlamp/headlamp`
- **Auth**: OIDC via Forgejo. References existing K8s secret `oidc` in the headlamp namespace (created during initial setup with clientID, clientSecret, issuerURL, scopes).
- **Service account**: `headlamp` with `cluster-admin` ClusterRoleBinding (`headlamp-admin`)
- **TLS skip**: `HEADLAMP_CONFIG_OIDC_SKIP_TLS_VERIFY=true` env var skips TLS verification for the OIDC backchannel (required because of self-signed certs)

### Woodpecker (CI/CD)
- **Config**: `woodpecker-values.yaml`, `woodpecker-rbac.yaml`
- **Namespace**: `woodpecker`
- **Domain**: `ci.dev.test`
- **Helm chart**: `woodpecker/woodpecker`
- **Auth**: Forgejo OAuth2 integration
- **Backend**: Kubernetes-native (pipelines run as pods)
- **Secrets**: `woodpecker-secrets` — referenced as existing K8s secret
- **RBAC**: `woodpecker-deployer` ClusterRole grants the agent permissions to manage deployments, services, secrets, pods, ingresses, and jobs

### PostgreSQL (CNPG)
- **Config**: `forgejo-config.yaml`
- **Namespace**: `postgres`
- **Access**: `postgres-rw.postgres.svc.cluster.local:5432`
- **Instances**: 1 (non-HA, dev environment)
- **Databases**: `forgejo`, `platform_ledger`, `product_garden`
- **Resources**: 256Mi–1Gi memory, 100m–1000m CPU, 10Gi storage
- **Max connections**: 200

## Namespace Layout

| Namespace | Services |
|-----------|----------|
| `postgres` | CNPG PostgreSQL cluster |
| `forgejo` | Forgejo |
| `headlamp` | Headlamp |
| `woodpecker` | Woodpecker server + agent |
| `minio` | MinIO (object storage) |
| `kube-system` | Traefik, CoreDNS, metrics-server |

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
  - "oidc-client-id=<headlamp-client-id-from-forgejo>"
  - "oidc-username-claim=preferred_username"
  - "oidc-username-prefix=-"
  - "oidc-groups-claim=groups"
  - "oidc-ca-file=/usr/local/share/ca-certificates/openplatform.crt"
```

Changes require: `colima ssh -- sudo systemctl restart k3s`

### OIDC Gotchas

- **`oidc-client-id`** must be the OAuth2 application client ID from Forgejo, not a URL or callback path.
- **`oidc-username-prefix=-`** is required. Without it, the API server prepends the issuer URL to usernames (e.g., `https://forgejo.dev.test#trevato` instead of `trevato`), causing RBAC mismatches.
- **Config requires restart** — k3s only reads `/etc/rancher/k3s/config.yaml` at startup. Verify flags are active: `colima ssh -- sudo journalctl -u k3s -n 50 --no-pager | grep oidc`
- **DNS inside the VM** — `forgejo.dev.test` must resolve inside the Colima VM. Check `/etc/hosts` in the VM has an entry pointing to the VM's IP (e.g., `192.168.64.3 forgejo.dev.test`).

## Secrets Management

### Pattern
- **Forgejo**: references existing K8s secrets (`forgejo-admin-credentials`, `forgejo-db-config`)
- **Headlamp**: references existing K8s secret (`oidc`) — previously created by the Helm chart, now preserved
- **Woodpecker**: references existing K8s secret (`woodpecker-secrets`)
- **OAuth2 credentials**: stored in `.env` (gitignored), documented in `.env.example`

### Creating the `oidc` secret for Headlamp
```bash
kubectl create secret generic oidc -n headlamp \
  --from-literal=clientID=<id> \
  --from-literal=clientSecret=<secret> \
  --from-literal=issuerURL=https://forgejo.dev.test \
  --from-literal=scopes=openid,profile,email,groups
```

### RBAC for OIDC users
```bash
kubectl create clusterrolebinding oidc-admin --clusterrole=cluster-admin --user=trevato
```

## Deploy Order

1. Namespaces
2. PostgreSQL (`forgejo-config.yaml`)
3. K8s secrets (admin creds, db config, oidc, woodpecker)
4. Forgejo (Helm)
5. Register OAuth2 applications in Forgejo UI
6. Headlamp (Helm)
7. Woodpecker (Helm + `woodpecker-rbac.yaml`)

## Known Quirks

- **Headlamp "failed to append ca cert to pool" log error** — cosmetic bug. Fires when no `--oidc-ca-file` is set because the code creates a non-nil pointer to an empty string. The TLS skip transport is already applied before this code path. Harmless.
- **Headlamp OIDC scopes** — must be comma-separated in the values file (`"openid,profile,email,groups"`), not space-separated.
- **Woodpecker server URL** — uses `http://ci.dev.test` (not https) in the values for internal agent communication.
- **Forgejo SSH** — listens on port 2222 internally, exposed on port 22 via ingress/service.

## Development Conventions

- **Package management**: bun (JavaScript/TypeScript), uv (Python)
- **YAML style**: 2-space indentation, quoted strings for values with special characters
- **Helm values files**: named `<service>-values.yaml`
- **K8s manifests**: named `<service>-<resource>.yaml` (e.g., `woodpecker-rbac.yaml`)
- **Domain convention**: `<service>.dev.test`
