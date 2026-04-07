# External Infrastructure Mode

By default, Open Platform installs and manages its own infrastructure components (Traefik, CNPG, cert-manager, MetalLB). This is ideal for fresh clusters where OP is the only tenant.

In production environments where the cluster hosts other workloads — KubeVirt VMs, DNS servers, monitoring stacks, AI services — infrastructure has its own lifecycle and shouldn't be managed by an application platform. External infrastructure mode addresses this.

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

## What changes

| Component | Bundled (default) | External |
|-----------|-------------------|----------|
| **Traefik** | Installed by helmfile, managed by Flux | Expected pre-installed, OP creates Ingress resources only |
| **CNPG operator** | Installed by helmfile, managed by Flux | Expected pre-installed, OP applies Cluster manifest only |
| **cert-manager** | Installed if `tls.mode=letsencrypt` | Expected pre-installed if `tls.mode=letsencrypt` |
| **MetalLB** | Installed if `network.mode=loadbalancer` | Expected pre-installed if `network.mode=loadbalancer` |
| **Flux** | Installed by helmfile | Expected pre-installed, OP only registers its GitRepository + Kustomization |
| **Forgejo** | No change | No change |
| **All apps** | No change | No change |

## How it works

1. `generate-config.sh` reads `infrastructure.mode` from config
2. In external mode, infrastructure helm releases (traefik, cnpg) are removed from `helmfile.yaml`
3. Flux HelmRelease manifests for infrastructure controllers are not generated
4. A lightweight `infra-bootstrap` release handles namespace creation, secrets, TLS config, CoreDNS setup, and postgres cluster initialization — tasks normally done in traefik/cnpg postsync hooks
5. `deploy.sh` runs `check-infra.sh` to validate that required components exist before proceeding

## Pre-requisites for external mode

Before running `make deploy` with `infrastructure.mode=external`:

### Traefik
- Running in `kube-system` namespace
- Watching all namespaces for Ingress and IngressRoute resources
- `kubernetesIngress` and `kubernetesCRD` providers enabled

### CNPG (CloudNative PostgreSQL)
- Operator running in `cnpg-system` namespace
- CRDs installed (Cluster, Backup, etc.)

### cert-manager (if `tls.mode=letsencrypt`)
- Running in `cert-manager` namespace
- CRDs installed (Certificate, ClusterIssuer, etc.)

### MetalLB (if `network.mode=loadbalancer`)
- Running in `metallb-system` namespace
- Address pool and L2Advertisement configured for OP's VIP range

### Flux
- Controllers running in `flux-system` namespace (source-controller, kustomize-controller, helm-controller)
- CRDs installed (GitRepository, Kustomization, HelmRelease, etc.)
- OP's `setup-flux.sh` will create a GitRepository + Kustomization pointing to Forgejo

## Architecture

```
┌──────────── Cluster ─────────────────────────────────────┐
│                                                           │
│  Infrastructure (managed independently):                 │
│  ├── Traefik        → routes *.platform.example.com      │
│  ├── MetalLB        → assigns VIPs                       │
│  ├── cert-manager   → issues TLS certs                   │
│  ├── CNPG operator  → manages PostgreSQL clusters        │
│  ├── Flux           → GitOps engine (multi-source)       │
│  ├── CoreDNS        → resolves internal + external DNS   │
│  ├── KubeVirt       → runs Windows VMs                   │
│  └── (other infra)  → monitoring, AI services, etc.      │
│                                                           │
│  Open Platform (infrastructure.mode=external):           │
│  ├── Forgejo        → git + OIDC identity                │
│  ├── Woodpecker     → CI/CD                              │
│  ├── Headlamp       → K8s dashboard                      │
│  ├── MinIO          → object storage                     │
│  ├── PostgreSQL     → CNPG cluster (OP's databases)      │
│  ├── Flux           → GitOps for OP workloads            │
│  └── Apps           → whatever you build                 │
│                                                           │
│  Other tenants (vClusters):                              │
│  ├── espo-ai        → ChromaDB, Ollama, data pipelines   │
│  ├── espoengineering→ child company workloads            │
│  └── (future)       → additional child companies         │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

## Companion: NixOS-K8s

For teams running NixOS + K3s, the [nixos-k8s](https://github.com/your-org/nixos-k8s) framework provides the infrastructure layer that pairs with Open Platform in external mode:

- NixOS configurations for bare-metal K3s nodes
- ZFS storage, 10G networking, GPU passthrough
- KubeVirt for Windows VM migration
- Infrastructure helm charts (Traefik, MetalLB, cert-manager, CNPG)
- CoreDNS for internal + external DNS

This separation means:
- **Infrastructure team** manages the cluster, networking, storage, and VMs
- **Platform team** manages Open Platform and application workloads
- Neither can break the other
