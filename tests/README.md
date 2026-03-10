# Tests

Three layers of testing, each building on the previous.

## Smoke Tests (`smoke.sh`)

Fast curl-based probes. Verifies all services respond via HTTPS. No kubectl or browser required.

```bash
PLATFORM_DOMAIN=open-platform.sh ./tests/smoke.sh

# Test a vCluster instance
PLATFORM_DOMAIN=open-platform.sh SERVICE_PREFIX=buster- ./tests/smoke.sh
```

Checks: Forgejo API (200), Woodpecker healthz (200), Headlamp (200/302), MinIO (200/302/307), S3 (403), OAuth2-Proxy ping (200). Discovers and checks deployed apps via kubectl if available.

## K8s Health (`k8s-health.sh`)

Validates pod status, deployment readiness, ingress configuration, and database health.

```bash
./tests/k8s-health.sh

# Check a specific vCluster
VCLUSTER_NS=vc-buster ./tests/k8s-health.sh
```

## E2E Tests (Playwright)

Browser-based tests for auth flows and app functionality. Read-only against production.

### Setup

```bash
cd tests/e2e
bun install
bun x playwright install chromium
```

### Run

```bash
# All tests
PLATFORM_DOMAIN=open-platform.sh \
FORGEJO_ADMIN_PASSWORD=<password> \
  bun x playwright test

# Platform services only
bun x playwright test platform/

# Auth flows only
bun x playwright test platform/*-auth*

# vCluster instance
PLATFORM_DOMAIN=open-platform.sh \
SERVICE_PREFIX=buster- \
FORGEJO_ADMIN_PASSWORD=<password> \
  bun x playwright test
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PLATFORM_DOMAIN` | Yes | Platform domain (e.g., `open-platform.sh`) |
| `SERVICE_PREFIX` | No | Instance prefix with trailing dash (e.g., `buster-`) |
| `FORGEJO_ADMIN_USER` | No | Admin username (default: `opadmin`) |
| `FORGEJO_ADMIN_PASSWORD` | Yes | Admin password |
| `TLS_SKIP_VERIFY` | No | Skip TLS verification (default: `true`) |

### Test Structure

```
tests/
  smoke.sh                           # curl-based service probes
  k8s-health.sh                      # kubectl resource health
  e2e/
    playwright.config.ts             # Playwright config
    global.setup.ts                  # Forgejo login, saves storageState
    helpers/
      config.ts                      # URL builders, env var reading
      auth.ts                        # Login helper, grant page handler
    platform/
      services.spec.ts               # All 6 services load in browser
      forgejo-auth.spec.ts           # Admin login, API, system org/repos
      woodpecker-auth.spec.ts        # OAuth2 redirect chain completes
      headlamp-auth.spec.ts          # OIDC redirect chain completes
    apps/
      deployed.spec.ts               # All apps in workload namespaces respond
      app-auth.spec.ts               # better-auth sign-in flow on social app
```

### Makefile Targets

```bash
make test-smoke          # Fast curl-based checks
make test-k8s            # kubectl resource health
make test-e2e            # All Playwright tests
make test-e2e-platform   # Platform tests only
make test-e2e-auth       # Auth flow tests only
```
