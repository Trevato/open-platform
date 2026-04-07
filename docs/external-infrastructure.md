# External Infrastructure Mode

By default, Open Platform installs and manages its own infrastructure components (Traefik, CNPG, cert-manager, MetalLB, Flux) and deploys directly on the host cluster. This is ideal for fresh clusters where OP is the only tenant.

In production environments where the cluster hosts other workloads — KubeVirt VMs, DNS servers, monitoring stacks, AI services — infrastructure has its own lifecycle and shouldn't be managed by an application platform. External infrastructure mode addresses this by deploying OP into its own vCluster, consuming pre-existing infrastructure.

## Configuration

```yaml
# open-platform.yaml
domain: platform.example.com

infrastructure:
  mode: external    # "bundled" (default) or "external"

network:
  mode: loadbalancer
  traefik_ip: 10.0.16.10
  address_pool: 10.0.16.0/24
  interface: vlan101
```

## Deployment Models

### Bundled (default)

OP installs everything on the host cluster. Simple, self-contained, good for dev or single-tenant clusters.

```
Host Cluster
├── Infrastructure (installed by OP)
│   └── Traefik, MetalLB, cert-manager, CNPG, Flux
├── OP Services (host namespaces)
│   └── Forgejo, Woodpecker, Headlamp, MinIO, ...
└── Nothing else
```

### External

OP deploys into its own vCluster, consuming infrastructure that already exists on the host. Infrastructure and platform have independent lifecycles. Other tenants (AI services, child companies) get their own vClusters too.

```
Host Cluster (managed by infrastructure team)
├── Infrastructure
│   ├── Traefik       → routes *.domain for all vClusters
│   ├── MetalLB       → assigns VIPs
│   ├── cert-manager  → issues TLS certs
│   ├── CNPG operator → manages PostgreSQL clusters
│   ├── Flux          → multi-source GitOps engine
│   ├── vCluster      → virtual cluster operator
│   ├── CoreDNS       → internal + external DNS
│   └── KubeVirt      → Windows VM lifecycle
│
├── vCluster: open-platform (managed by OP / platform team)
│   ├── Forgejo       → git + OIDC identity provider
│   ├── Woodpecker    → CI/CD pipelines
│   ├── Headlamp      → K8s dashboard
│   ├── MinIO         → object storage
│   ├── PostgreSQL    → CNPG cluster (OP's databases)
│   └── Apps          → whatever you build
│
├── vCluster: espo-ai
│   ├── ChromaDB      → vector database
│   ├── Ollama        → local LLM inference
│   └── Data pipelines
│
└── vCluster: child-company (future tenants)
    └── Company-specific workloads
```

## How it works

### Deploy flow (external mode)

```
make deploy
│
├── Phase 0:   Generate config from open-platform.yaml
├── Phase 0.5: Validate external infrastructure (check-infra.sh)
│              ├── Traefik running?
│              ├── CNPG operator running?
│              ├── cert-manager running? (if letsencrypt)
│              ├── MetalLB running? (if loadbalancer)
│              ├── Flux running?
│              └── vCluster operator running?
│
├── Phase 0.6: Create vCluster "open-platform" (if not exists)
│              └── Configure Ingress syncing to host Traefik
│
├── Phase 1:   helmfile sync (targeting vCluster API server)
│              ├── Skip: traefik, metallb, cert-manager, cnpg, flux
│              ├── Deploy: forgejo, minio, woodpecker, headlamp, ...
│              └── infra-bootstrap: namespaces, secrets, TLS, CoreDNS, postgres
│
├── Phase 2:   OIDC setup (k3s API server config)
├── Phase 3:   Woodpecker repo setup + pipeline triggers
└── Done
```

### Ingress syncing

Services inside the vCluster create standard Kubernetes Ingress resources. The vCluster syncer pushes these to the host cluster, where Traefik picks them up and routes traffic. From Traefik's perspective, vCluster Ingresses look like any other Ingress — no special configuration needed.

```
App in vCluster → creates Ingress → vCluster syncer → host Ingress → Traefik → client
```

### Flux multi-source pattern

With OP in a vCluster, the host Flux manages infrastructure while OP's Flux (inside the vCluster) manages application workloads:

```
Host Flux (infrastructure team)
├── GitRepo: nixos-k8s/infrastructure
│   ├── Traefik HelmRelease
│   ├── MetalLB config
│   ├── cert-manager + ClusterIssuer
│   └── CNPG operator
│
vCluster Flux (platform team)
├── GitRepo: system/open-platform (on Forgejo)
│   ├── Forgejo, Woodpecker, Headlamp
│   └── App deployments
```

Neither Flux instance can affect the other. Infrastructure upgrades don't touch OP. OP deployments don't touch infrastructure.

## What changes

| Component | Bundled (default) | External |
|-----------|-------------------|----------|
| **Traefik** | Installed by helmfile | Pre-installed on host, OP syncs Ingress from vCluster |
| **CNPG operator** | Installed by helmfile | Pre-installed on host, OP creates Cluster in vCluster |
| **cert-manager** | Installed if letsencrypt | Pre-installed on host (if letsencrypt) |
| **MetalLB** | Installed if loadbalancer | Pre-installed on host (if loadbalancer) |
| **Flux** | Installed by helmfile | Pre-installed on host, OP runs own Flux inside vCluster |
| **OP services** | Host namespaces | Inside vCluster "open-platform" |
| **Isolation** | Shared with host | Full vCluster isolation |

## Pre-requisites

Before running `make deploy` with `infrastructure.mode=external`, the following must be running on the host cluster. See the [Companion: NixOS-K8s](#companion-nixos-k8s) section for a reference implementation.

### Required

- **Traefik** — in `kube-system`, watching all namespaces for Ingress resources
- **CNPG operator** — in `cnpg-system`, CRDs installed
- **Flux** — in `flux-system`, all controllers running
- **vCluster operator** — installed, able to create virtual clusters

### Conditional

- **cert-manager** — in `cert-manager` (if `tls.mode=letsencrypt`)
- **MetalLB** — in `metallb-system` (if `network.mode=loadbalancer`)

## Companion: NixOS-K8s

The infrastructure layer that pairs with Open Platform in external mode. For teams running bare-metal NixOS + K3s, [nixos-k8s](https://github.com/ESPO-Engineering/nixos-k8s) provides:

### What it manages (Layer 0-1)

- **NixOS configurations** for bare-metal K3s nodes (declarative, reproducible)
- **ZFS storage** with per-node raidz1 pools for data sovereignty
- **10G networking** via bonded NICs, VLAN-aware bridging
- **GPU passthrough** for AI/ML workloads
- **Infrastructure helm charts**: Traefik, MetalLB, cert-manager, CNPG, Flux, vCluster
- **CoreDNS** for internal service discovery + external DNS resolution
- **KubeVirt** for Windows VM migration and lifecycle management

### What it doesn't manage (Layer 2+)

- Open Platform (deploys itself into a vCluster)
- Application workloads (managed by OP's Woodpecker CI)
- Tenant vClusters (managed by OP's provisioner)

### The contract between nixos-k8s and Open Platform

```
nixos-k8s guarantees:                  Open Platform expects:
├── K3s cluster running                ├── kubectl access
├── Traefik watching Ingress           ├── Ingress → routes traffic
├── MetalLB assigning VIPs             ├── LoadBalancer → gets IP
├── cert-manager issuing certs         ├── Certificate → gets TLS
├── CNPG operator ready                ├── Cluster → gets PostgreSQL
├── Flux controllers running           ├── GitRepository → gets reconciled
└── vCluster operator ready            └── vCluster → gets created
```

This separation means:
- **Infrastructure team** manages the cluster, networking, storage, and VMs
- **Platform team** manages Open Platform and application workloads
- **Tenants** get isolated vClusters with their own lifecycle
- No team can break another team's workloads
