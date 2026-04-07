# Migrating from Bundled to External Infrastructure

This guide covers switching a running Open Platform deployment from `infrastructure.mode=bundled` to `external`.

## Overview

In bundled mode, OP's Flux manages HelmReleases for Traefik, CNPG, cert-manager, and MetalLB. Switching to external mode means these components continue running but are no longer managed by OP's Flux. The infrastructure team takes ownership.

## Pre-migration Checklist

- [ ] Document current Traefik version and values (`helm get values traefik -n kube-system`)
- [ ] Document current CNPG version and values (`helm get values cnpg -n cnpg-system`)
- [ ] Document current cert-manager version (if applicable)
- [ ] Document current MetalLB version and config (if applicable)
- [ ] Ensure infrastructure team has helm access to manage these releases directly
- [ ] Back up `system/open-platform` repo from Forgejo

## Migration Steps

### 1. Adopt infrastructure helm releases

Before switching modes, ensure the infrastructure releases won't be orphaned.
The infrastructure team should be prepared to manage them via their own tooling
(helm, a separate Flux instance, or NixOS configuration).

```bash
# Record current release state
helm list -A | grep -E "traefik|cnpg|cert-manager|metallb"
```

### 2. Update Open Platform config

```yaml
# open-platform.yaml
infrastructure:
  mode: external
```

### 3. Regenerate and deploy

```bash
make generate   # Regenerates helmfile.yaml, platform/ manifests
make deploy     # Deploys with external mode — skips infra releases
```

### 4. Clean up Flux-managed infrastructure manifests

After deploy, the `system/open-platform` repo on Forgejo will no longer contain
HelmRelease manifests for Traefik or CNPG. Flux will automatically delete the
Flux-managed HelmRelease resources (but NOT the actual running deployments,
since helm releases are independent of Flux HelmRelease CRDs).

Verify the infrastructure is still running:

```bash
kubectl get pods -n kube-system -l app.kubernetes.io/name=traefik
kubectl get pods -n cnpg-system -l app.kubernetes.io/name=cloudnative-pg
```

### 5. (Optional) Re-adopt releases with external tooling

If you want the infrastructure releases managed by a separate Flux instance
or helm wrapper:

```bash
# Example: infrastructure team manages via plain helm
helm upgrade traefik traefik/traefik -n kube-system -f your-traefik-values.yaml
```

## Rollback

To switch back to bundled mode:

```yaml
# open-platform.yaml
infrastructure:
  mode: bundled   # or just remove the infrastructure section
```

Then re-run `make generate && make deploy`. OP will re-install and Flux-manage
the infrastructure components.

## What to watch for

- **Helm release ownership**: After switching to external, OP no longer upgrades
  Traefik/CNPG. The infrastructure team must handle version upgrades.
- **CRD compatibility**: If the infrastructure team upgrades CNPG to a new major
  version, ensure OP's postgres-cluster.yaml manifest is compatible.
- **Traefik IngressClass**: OP creates Ingress resources with `className: traefik`.
  Ensure external Traefik is configured to watch this IngressClass.
