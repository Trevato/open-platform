#!/usr/bin/env bash
set -euo pipefail

# Validates that required infrastructure components are present.
# Called during deploy when infrastructure.mode=external.
#
# Required:
#   - Traefik (ingress controller watching all namespaces)
#   - CNPG operator (CloudNative PostgreSQL)
#
# Conditional:
#   - cert-manager (if tls.mode=letsencrypt)
#   - MetalLB (if network.mode=loadbalancer)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Load config
set -a
# shellcheck source=/dev/null
source "$ROOT_DIR/.env"
set +a

echo "Checking external infrastructure..."

FAILED=false

# Check Traefik
if kubectl get deployment -n kube-system -l app.kubernetes.io/name=traefik -o name 2>/dev/null | grep -q deployment; then
  echo "  [OK] Traefik found in kube-system"
elif kubectl get daemonset -n kube-system -l app.kubernetes.io/name=traefik -o name 2>/dev/null | grep -q daemonset; then
  echo "  [OK] Traefik found in kube-system (DaemonSet)"
else
  echo "  [FAIL] Traefik not found. Install Traefik in kube-system namespace."
  FAILED=true
fi

# Check CNPG operator
if kubectl get deployment -n cnpg-system -l app.kubernetes.io/name=cloudnative-pg -o name 2>/dev/null | grep -q deployment; then
  echo "  [OK] CNPG operator found in cnpg-system"
else
  echo "  [FAIL] CNPG operator not found. Install cloudnative-pg in cnpg-system namespace."
  FAILED=true
fi

# Check cert-manager (only if letsencrypt mode)
if [ "${TLS_MODE:-selfsigned}" = "letsencrypt" ]; then
  if kubectl get deployment -n cert-manager cert-manager -o name 2>/dev/null | grep -q deployment; then
    echo "  [OK] cert-manager found"
  else
    echo "  [FAIL] cert-manager not found (required for tls.mode=letsencrypt)."
    FAILED=true
  fi
fi

# Check MetalLB (only if loadbalancer mode)
if [ "${NETWORK_MODE:-host}" = "loadbalancer" ]; then
  if kubectl get deployment -n metallb-system metallb-controller -o name 2>/dev/null | grep -q deployment; then
    echo "  [OK] MetalLB found"
  else
    echo "  [FAIL] MetalLB not found (required for network.mode=loadbalancer)."
    FAILED=true
  fi
fi

# Check Flux controllers
if kubectl get deployment -n flux-system source-controller -o name 2>/dev/null | grep -q deployment; then
  echo "  [OK] Flux source-controller found in flux-system"
else
  echo "  [FAIL] Flux not found. Install Flux in flux-system namespace."
  echo "         (helm install flux fluxcd-community/flux2 -n flux-system --create-namespace)"
  FAILED=true
fi

if [ "$FAILED" = true ]; then
  echo ""
  echo "External infrastructure check failed."
  echo "Either install the missing components or set infrastructure.mode=bundled."
  exit 1
fi

echo "  All infrastructure checks passed."
