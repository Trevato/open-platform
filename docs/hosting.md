# Multi-Tenant Hosting

Each customer gets an isolated, fully-functional open-platform instance running inside a vCluster on the host k3s cluster. Every instance includes its own Forgejo, Woodpecker, Headlamp, MinIO, and PostgreSQL -- completely independent from other tenants.

## Architecture

```
Host k3s (VxRail)
|
+-- provisioner ns        Reconciler CronJob (polls console DB, runs provision/teardown)
+-- op-system-console     Management console (instance lifecycle, credentials, monitoring)
+-- cloudflare ns         Cloudflared tunnel (*.open-platform.sh)
|
+-- vc-acme ns            Customer "acme" vCluster
|   +-- forgejo, woodpecker, headlamp, minio, postgres
|   +-- op-system-* namespaces (apps deployed by Woodpecker)
|   +-- Ingresses synced to host Traefik via acme-forgejo.open-platform.sh, etc.
|
+-- vc-foxtrot ns         Customer "foxtrot" vCluster
|   +-- (same full stack, independently configured)
```

The host Traefik routes all traffic. Each vCluster's ingresses sync to the host namespace (`vc-{slug}`) where Traefik picks them up automatically. TLS terminates at the host layer (Cloudflare tunnel or Traefik default TLSStore).

## Domain Isolation

The `service_prefix` config parameter creates unique subdomains per instance. For a customer with slug `acme`:

| Service    | URL                                      |
| ---------- | ---------------------------------------- |
| Forgejo    | `https://acme-forgejo.open-platform.sh`  |
| Woodpecker | `https://acme-ci.open-platform.sh`       |
| Headlamp   | `https://acme-headlamp.open-platform.sh` |
| MinIO      | `https://acme-minio.open-platform.sh`    |
| S3 API     | `https://acme-s3.open-platform.sh`       |
| K8s API    | `https://acme-k8s.open-platform.sh`      |

The prefix is injected at config generation time (`service_prefix: "acme-"`) and propagated to Woodpecker org secrets so CI pipelines resolve the correct registry and domain.

## Resource Tiers

Each instance runs within resource limits determined by its tier.

| Tier | CPU  | Memory | Storage |
| ---- | ---- | ------ | ------- |
| Free | 500m | 2Gi    | 10Gi    |
| Pro  | 2    | 8Gi    | 50Gi    |
| Team | 4    | 16Gi   | 100Gi   |

These limits apply to the vCluster control plane StatefulSet. Resources are set via helm `--set` flags during provisioning and can be changed by upgrading the instance tier.

## Provisioning Flow

When a user creates an instance through the console, it enters `pending` status. The reconciler CronJob picks it up within 60 seconds and runs `provision-instance.sh`, which executes 8 phases:

### Phase 1: Create Namespace

Creates `vc-{slug}` on the host cluster with labels for management (`open-platform.sh/managed`, `open-platform.sh/tier`, `open-platform.sh/slug`).

### Phase 2: Install vCluster

Installs the vCluster Helm chart into the namespace with tier-based resource limits. Extra SANs are added to the API server TLS cert for both in-cluster DNS (`{slug}.vc-{slug}.svc.cluster.local`) and external access (`{slug}-k8s.{domain}`). Upgrades cleanly if the release already exists.

### Phase 3: Wait for Ready

Blocks until the vCluster control plane deployment or statefulset reaches ready state (up to 300s timeout).

### Phase 4: Extract Kubeconfig

Reads the vCluster kubeconfig from the `vc-{slug}` K8s secret and rewrites the server URL to use in-cluster service DNS. The provisioner pod communicates with the vCluster directly -- no port-forward needed.

### Phase 5: Verify Connectivity

Retries `kubectl get namespaces` against the vCluster API for up to 60 seconds, confirming the extracted kubeconfig works.

### Phase 6: Generate Instance Config

Copies the platform source tree into a temp directory, generates `open-platform.yaml` with the customer's slug as `service_prefix`, and runs `generate-config.sh` to produce all values files, manifests, and `.env`. Customer vClusters use `selfsigned` TLS mode since the host Traefik provides real certificates.

### Phase 7: Deploy into vCluster

Three sub-phases:

- **7a: helmfile sync** -- Bootstraps all platform services (Forgejo, Woodpecker, Headlamp, MinIO, PostgreSQL) inside the vCluster. Flux is excluded (`tier!=platform`) since customer instances are managed by the provisioner, not GitOps.
- **7b: Post-deploy setup** -- Runs `setup-woodpecker-repos.sh` to activate repos and configure CI secrets.
- **7c: OIDC configuration** -- Upgrades the vCluster with API server OIDC flags pointing to the instance's Forgejo, mounts the CA cert, creates RBAC bindings for the admin user, and validates OIDC discovery endpoint reachability.

### Phase 8: Store Metadata

Stores instance metadata as a ConfigMap on the host. Creates a Traefik Middleware for Headlamp's `X-Forwarded-Proto` header. Creates an IngressRoute for external `kubectl` access via `{slug}-k8s.{domain}`. Generates a token-based kubeconfig (720h expiry) that works through Cloudflare tunnel. Writes the admin password and kubeconfig to temp files for the reconciler to store in the console database.

## Teardown Flow

When an instance is deleted through the console, its status changes to `terminating`. The reconciler runs `teardown-instance.sh`, which:

1. **Uninstalls the vCluster Helm release** -- waits up to 120s; if it fails, proceeds to namespace deletion.
2. **Deletes the namespace** -- removes `vc-{slug}` with all child resources. If finalizers block deletion beyond 120s, force-finalizes via the raw API.
3. **Cleans up orphaned resources** -- removes cluster-scoped resources labeled with the instance slug (ClusterRoleBindings, ClusterRoles) and provision logs.

The reconciler updates the console database to `terminated` status on success, or `failed` with an error message on failure.

## Health Monitoring

A separate CronJob runs every 5 minutes (`provisioner-health-check`). For each instance in `ready` status, it sends an HTTPS request to the Forgejo endpoint (`https://{slug}-forgejo.{domain}`).

- **Healthy**: HTTP 2xx-4xx updates `last_healthy_at` and resets the failure counter.
- **Unreachable**: Increments a consecutive failure counter. After 3 consecutive failures spanning 15+ minutes, the instance is marked `unhealthy`.
- **Recovery**: Unhealthy instances are also probed. If they respond, status reverts to `ready`.

## Console Management

The console (`console.open-platform.sh`) is the web UI for managing instances.

### Dashboard

Lists all instances with status badges (pending, provisioning, ready, unhealthy, failed, terminating). Admins see all instances; regular users see only their own.

### Creating an Instance

The `/dashboard/new` page collects:

- **Platform name** -- display label (2-64 characters)
- **Slug** -- auto-generated from name, used in URLs and resource names (3-32 lowercase alphanumeric + hyphens)
- **Admin email** -- defaults to the logged-in user's email
- **Resource tier** -- free, pro, or team

After submission, the instance enters `pending` status. The detail page at `/dashboard/{slug}` shows a live provision terminal that streams events as they happen.

### Instance Detail

Once provisioned, the detail page shows:

- **Service cards** -- direct links to Forgejo, Woodpecker, Headlamp, and MinIO
- **Events timeline** -- full audit log of provisioning phases, health checks, and password resets
- **Live service health** -- real-time status of each service within the vCluster
- **Deployed apps** -- apps running inside the instance's Woodpecker/K8s stack

### Credentials and Kubeconfig

The settings page (`/dashboard/{slug}/settings`) provides:

- **Admin credentials** -- view the Forgejo admin username and password
- **Password reset** -- generates a new password and applies it to Forgejo inside the vCluster
- **Kubeconfig download** -- token-based kubeconfig for `kubectl` access via `{slug}-k8s.{domain}`

## API

The op-api service exposes instance management at `/api/v1/instances`:

| Method   | Path                           | Description                            |
| -------- | ------------------------------ | -------------------------------------- |
| `GET`    | `/instances`                   | List instances (`?all=true` for admin) |
| `POST`   | `/instances`                   | Create instance                        |
| `GET`    | `/instances/:slug`             | Instance detail with events            |
| `DELETE` | `/instances/:slug`             | Request termination                    |
| `GET`    | `/instances/:slug/credentials` | Get admin credentials                  |
| `POST`   | `/instances/:slug/credentials` | Reset admin password                   |
| `GET`    | `/instances/:slug/kubeconfig`  | Download kubeconfig                    |
| `GET`    | `/instances/:slug/services`    | Live service health                    |
| `GET`    | `/instances/:slug/apps`        | List deployed apps                     |

## Configuration

### Deploying the Provisioner

Prerequisites: a running host k3s cluster with the ops vCluster (`vc-open-platform-sh`) containing Forgejo and PostgreSQL.

```bash
host/deploy-provisioner.sh
```

This script:

1. Creates the `provisioner` namespace
2. Pushes the `system/deploy-bundle` repo to Forgejo (full platform codebase for provisioning)
3. Creates secrets: `provisioner-db` (PostgreSQL connection) and `provisioner-forgejo` (admin credentials)
4. Creates the `provisioner-scripts` ConfigMap (reconciler.sh, health-check.sh)
5. Applies the CronJob manifest

### CronJob Details

| CronJob                    | Schedule    | Timeout | Description                             |
| -------------------------- | ----------- | ------- | --------------------------------------- |
| `provisioner-reconciler`   | Every 1 min | 1 hour  | Polls for pending/terminating instances |
| `provisioner-health-check` | Every 5 min | 5 min   | Probes ready instances via HTTPS        |

Both run with a `provisioner` ServiceAccount bound to `cluster-admin` on the host. The reconciler's init container clones the deploy-bundle repo; the main container installs helm, helmfile, and kubectl, then executes the reconciler script.

### Monitoring

```bash
# Watch provisioner jobs
kubectl get jobs -n provisioner -w

# Stream reconciler logs
kubectl logs -n provisioner -l component=reconciler -f

# Stream health check logs
kubectl logs -n provisioner -l component=health-check -f
```

## Instance Lifecycle States

```
pending --> provisioning --> ready <--> unhealthy
   |              |            |
   v              v            v
 failed        failed     terminating --> terminated
```

- **pending**: Created in console DB, waiting for reconciler pickup
- **provisioning**: Reconciler is running provision-instance.sh
- **ready**: All 8 phases complete, services accessible
- **unhealthy**: Health check failed (3 consecutive failures over 15+ minutes)
- **failed**: Provisioning or teardown encountered a fatal error
- **terminating**: Teardown requested, reconciler processing
- **terminated**: Namespace and all resources deleted
