#!/usr/bin/env bash
set -euo pipefail

# Tears down a customer vCluster instance from the host k3s cluster.
# Uninstalls the vCluster helm release and deletes the namespace.
# Idempotent — safe to run on already-removed instances.
#
# Usage: teardown-instance.sh <slug>

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_FILE="/tmp/teardown-${1:-unknown}.log"

# ── Structured Logging ───────────────────────────────────────────────────────

log_event() {
  local phase="$1" status="$2" message="$3"
  local ts
  ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  local entry="{\"phase\": \"${phase}\", \"status\": \"${status}\", \"message\": \"${message}\", \"ts\": \"${ts}\"}"
  echo "$entry" >> "$LOG_FILE"
  if [ "$status" = "error" ]; then
    echo "ERROR [${phase}] ${message}" >&2
  else
    echo "[${phase}] ${message}"
  fi
}

# ── Argument Validation ──────────────────────────────────────────────────────

if [ $# -lt 1 ]; then
  echo "Usage: teardown-instance.sh <slug>"
  exit 1
fi

SLUG="$1"

if ! echo "$SLUG" | grep -Eq '^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$'; then
  echo "Error: invalid slug format."
  exit 1
fi

NAMESPACE="vc-${SLUG}"

: > "$LOG_FILE"
log_event "init" "ok" "Tearing down instance ${SLUG}"

# ── Phase 1: Uninstall vCluster Helm Release ─────────────────────────────────

log_event "helm-uninstall" "ok" "Uninstalling vCluster helm release"

if helm status "$SLUG" -n "$NAMESPACE" >/dev/null 2>&1; then
  if helm uninstall "$SLUG" -n "$NAMESPACE" --wait --timeout 120s; then
    log_event "helm-uninstall" "ok" "Helm release uninstalled"
  else
    log_event "helm-uninstall" "error" "Helm uninstall failed — forcing namespace deletion"
  fi
else
  log_event "helm-uninstall" "ok" "Helm release not found — already removed"
fi

# ── Phase 2: Delete Namespace ────────────────────────────────────────────────

log_event "namespace-delete" "ok" "Deleting namespace ${NAMESPACE}"

if kubectl get namespace "$NAMESPACE" >/dev/null 2>&1; then
  # Remove any finalizers that might block deletion
  kubectl get pvc -n "$NAMESPACE" -o name 2>/dev/null | while read -r pvc; do
    kubectl patch "$pvc" -n "$NAMESPACE" -p '{"metadata":{"finalizers":null}}' 2>/dev/null || true
  done

  if kubectl delete namespace "$NAMESPACE" --wait --timeout 120s 2>/dev/null; then
    log_event "namespace-delete" "ok" "Namespace ${NAMESPACE} deleted"
  else
    # Force-remove if stuck (finalizers on resources inside)
    log_event "namespace-delete" "warn" "Namespace deletion timed out — attempting force removal"
    kubectl get namespace "$NAMESPACE" -o json 2>/dev/null | \
      jq '.spec.finalizers = []' | \
      kubectl replace --raw "/api/v1/namespaces/${NAMESPACE}/finalize" -f - 2>/dev/null || true
    log_event "namespace-delete" "ok" "Namespace ${NAMESPACE} force-finalized"
  fi
else
  log_event "namespace-delete" "ok" "Namespace ${NAMESPACE} not found — already removed"
fi

# ── Phase 3: Clean Up Stale Resources ────────────────────────────────────────

log_event "cleanup" "ok" "Checking for orphaned resources"

# Remove any cluster-scoped resources labeled with this instance
kubectl delete clusterrolebinding -l "open-platform.sh/slug=${SLUG}" 2>/dev/null || true
kubectl delete clusterrole -l "open-platform.sh/slug=${SLUG}" 2>/dev/null || true

# Clean up provision artifacts (log, credentials, kubeconfig)
rm -f "/tmp/provision-${SLUG}.log" \
      "/tmp/provision-${SLUG}.password" \
      "/tmp/provision-${SLUG}.kubeconfig" \
      "/tmp/provision-${SLUG}.clusterip"
log_event "cleanup" "ok" "Removed provision artifacts"

log_event "cleanup" "ok" "Orphaned resource cleanup complete"

# ── Done ─────────────────────────────────────────────────────────────────────

log_event "complete" "ok" "Instance ${SLUG} torn down successfully"

echo ""
echo "=== Instance Torn Down ==="
echo ""
echo "  Slug:      ${SLUG}"
echo "  Namespace: ${NAMESPACE} (deleted)"
echo "  Log:       ${LOG_FILE}"
