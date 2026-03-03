#!/usr/bin/env bash
set -euo pipefail

# Ordered teardown of the entire Open Platform.
# Handles Flux finalizers, CNPG clusters, CRDs, stuck namespaces, PVCs.
# Each phase tolerates failures — partial teardowns are safe.

echo "=== Open Platform Teardown ==="
START=$(date +%s)

# ── Phase 1: Remove Flux resources (clears finalizers) ──────────────────────

echo ""
echo "Phase 1: Removing Flux resources..."
kubectl delete kustomization --all -n flux-system --timeout=30s 2>/dev/null || true
kubectl delete gitrepository --all -n flux-system --timeout=30s 2>/dev/null || true
kubectl delete helmrelease --all -A --timeout=30s 2>/dev/null || true
kubectl delete ocirepository --all -n flux-system --timeout=30s 2>/dev/null || true

# Force-remove finalizers on any stuck Flux resources
for resource in kustomization gitrepository helmrelease ocirepository; do
  for item in $(kubectl get "$resource" -A -o jsonpath='{range .items[*]}{.metadata.namespace}/{.metadata.name}{"\n"}{end}' 2>/dev/null); do
    ns="${item%%/*}"
    name="${item##*/}"
    kubectl patch "$resource" "$name" -n "$ns" -p '{"metadata":{"finalizers":null}}' --type=merge 2>/dev/null || true
  done
done

# ── Phase 2: Remove app deployments (not managed by helmfile) ───────────────

echo "Phase 2: Removing app deployments and stateful data..."
for ns in social minecraft; do
  kubectl delete deploy,svc,ingress --all -n "$ns" --timeout=15s 2>/dev/null || true
done
# Delete Woodpecker PVCs to prevent stale DB state on next deploy
kubectl delete pvc --all -n woodpecker --timeout=15s 2>/dev/null || true

# ── Phase 3: Remove CNPG cluster ────────────────────────────────────────────

echo "Phase 3: Removing PostgreSQL cluster..."
kubectl delete cluster --all -n postgres --timeout=30s 2>/dev/null || true
# Force-remove finalizers if stuck
for cluster in $(kubectl get cluster -n postgres -o name 2>/dev/null); do
  kubectl patch "$cluster" -n postgres -p '{"metadata":{"finalizers":null}}' --type=merge 2>/dev/null || true
done
# Clean up pods that may linger
kubectl delete pods --all -n postgres --force --grace-period=0 2>/dev/null || true

# ── Phase 4: Helmfile destroy ───────────────────────────────────────────────

echo "Phase 4: Destroying helm releases..."
helmfile destroy 2>/dev/null || true

# Clean up any stuck helm release secrets
for ns in forgejo woodpecker headlamp minio oauth2-proxy cnpg-system flux-system kube-system; do
  kubectl delete secrets -n "$ns" -l owner=helm 2>/dev/null || true
done

# ── Phase 5: Delete CRDs ───────────────────────────────────────────────────

echo "Phase 5: Cleaning up CRDs..."

# Flux CRDs — patch finalizers first, then delete
for crd in $(kubectl get crds -o name 2>/dev/null | grep "toolkit.fluxcd.io" || true); do
  kubectl patch "$crd" -p '{"metadata":{"finalizers":null}}' --type=merge 2>/dev/null || true
  kubectl delete "$crd" --timeout=10s 2>/dev/null || true
done

# CNPG CRDs
for crd in $(kubectl get crds -o name 2>/dev/null | grep "cnpg.io" || true); do
  kubectl patch "$crd" -p '{"metadata":{"finalizers":null}}' --type=merge 2>/dev/null || true
  kubectl delete "$crd" --timeout=10s 2>/dev/null || true
done

# ── Phase 6: Force-finalize stuck namespaces ────────────────────────────────

echo "Phase 6: Cleaning up namespaces..."
PLATFORM_NAMESPACES="flux-system cnpg-system postgres forgejo headlamp woodpecker minio oauth2-proxy social minecraft"

for ns in $PLATFORM_NAMESPACES; do
  # Delete namespace (may already be terminating)
  kubectl delete ns "$ns" --timeout=10s 2>/dev/null || true
done

# Give a moment for graceful deletion
sleep 3

# Force-finalize any still stuck
for ns in $PLATFORM_NAMESPACES; do
  if kubectl get ns "$ns" -o jsonpath='{.status.phase}' 2>/dev/null | grep -q Terminating; then
    echo "  Force-finalizing $ns..."
    kubectl get ns "$ns" -o json | jq '.spec.finalizers = []' | \
      kubectl replace --raw "/api/v1/namespaces/$ns/finalize" -f - 2>/dev/null || true
  fi
done

# ── Phase 7: Clean up storage ──────────────────────────────────────────────

echo "Phase 7: Cleaning up storage..."
# PVCs in ghost namespaces may not be deletable — patch PV finalizers instead
for pv in $(kubectl get pv -o name 2>/dev/null); do
  kubectl patch "$pv" -p '{"metadata":{"finalizers":null}}' --type=merge 2>/dev/null || true
  kubectl delete "$pv" --timeout=5s 2>/dev/null || true
done

# ── Phase 8: Clean cluster-scoped resources ────────────────────────────────

echo "Phase 8: Cleaning up cluster-scoped resources..."
kubectl delete clusterrole woodpecker-deployer minecraft-manager 2>/dev/null || true
kubectl delete clusterrolebinding woodpecker-deployer woodpecker-pipeline-deployer oidc-admin 2>/dev/null || true

# ── Done ────────────────────────────────────────────────────────────────────

END=$(date +%s)
echo ""

# Final check
REMAINING=$(kubectl get ns --no-headers 2>/dev/null | grep -v -E "^(default|kube-)" | wc -l | tr -d ' ')
if [ "$REMAINING" = "0" ]; then
  echo "=== Teardown complete in $((END - START))s — clean slate ==="
else
  echo "=== Teardown complete in $((END - START))s ==="
  echo "Note: Some namespaces may still be finalizing. Re-run if needed."
  kubectl get ns --no-headers 2>/dev/null | grep -v -E "^(default|kube-)"
fi
