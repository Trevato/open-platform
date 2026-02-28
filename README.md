# Open Platform

Self-hosted developer infrastructure on Kubernetes. Git hosting, CI/CD, and cluster management — all authenticated through a single identity provider.

## Stack

| Service | Purpose | Domain |
|---------|---------|--------|
| **Forgejo** | Git repos, packages, OAuth2/OIDC provider | `forgejo.dev.test` |
| **Woodpecker** | CI/CD pipelines (Kubernetes-native) | `ci.dev.test` |
| **Headlamp** | Kubernetes dashboard | `headlamp.dev.test` |
| **PostgreSQL** | Database backend (CNPG) | cluster-internal |
| **Traefik** | Ingress + TLS termination | cluster-internal |

Forgejo is the identity hub — Headlamp and Woodpecker both authenticate through it via OIDC/OAuth2.

## Prerequisites

- [Colima](https://github.com/abiosoft/colima) with k3s runtime
- [Helm](https://helm.sh)
- `*.dev.test` resolving to your cluster (via `/etc/hosts` or local DNS)
- Self-signed CA trusted by your browser (see `certs/`)

## Deploy Order

Infrastructure must come up in dependency order:

1. **Namespaces** — `postgres`, `forgejo`, `headlamp`, `woodpecker`, `minio`
2. **PostgreSQL** — `kubectl apply -f forgejo-config.yaml`
3. **Secrets** — create `forgejo-admin-credentials`, `forgejo-db-config`, `oidc`, `woodpecker-secrets` in their respective namespaces
4. **Forgejo** — `helm install forgejo forgejo/forgejo -f forgejo-values.yaml -n forgejo`
5. **Register OAuth2 apps** in Forgejo for Headlamp, Woodpecker, and OAuth2 Proxy
6. **Headlamp** — `helm install headlamp headlamp/headlamp -f headlamp-values.yaml -n headlamp`
7. **Woodpecker** — `helm install woodpecker woodpecker/woodpecker -f woodpecker-values.yaml -n woodpecker` + `kubectl apply -f woodpecker-rbac.yaml`

## k3s OIDC Configuration

The k3s API server must be configured to accept Forgejo OIDC tokens. In the Colima VM at `/etc/rancher/k3s/config.yaml`:

```yaml
kube-apiserver-arg:
  - "oidc-issuer-url=https://forgejo.dev.test"
  - "oidc-client-id=<your-headlamp-client-id>"
  - "oidc-username-claim=preferred_username"
  - "oidc-username-prefix=-"
  - "oidc-groups-claim=groups"
  - "oidc-ca-file=/usr/local/share/ca-certificates/openplatform.crt"
```

Restart k3s after changes: `colima ssh -- sudo systemctl restart k3s`

## Secrets

OAuth2 client credentials are stored in `.env` (gitignored). Copy `.env.example` and populate after registering applications in Forgejo.
