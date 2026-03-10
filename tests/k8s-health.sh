#!/usr/bin/env bash
set -euo pipefail

# K8s health check: verifies pods, deployments, and ingresses are healthy.
# Requires kubectl with cluster access.
#
# Usage:
#   ./tests/k8s-health.sh
#   VCLUSTER_NS=vc-buster ./tests/k8s-health.sh   # check a vCluster

PASS=0
FAIL=0
TOTAL=0

check() {
  local name="$1" result="$2"
  TOTAL=$((TOTAL + 1))
  if [ "$result" = "ok" ]; then
    printf "  \033[32mPASS\033[0m  %s\n" "$name"
    PASS=$((PASS + 1))
  else
    printf "  \033[31mFAIL\033[0m  %s — %s\n" "$name" "$result"
    FAIL=$((FAIL + 1))
  fi
}

# Determine namespaces to check
if [ -n "${VCLUSTER_NS:-}" ]; then
  echo "Checking vCluster: ${VCLUSTER_NS}"
  NAMESPACES=$(kubectl get pods -n "$VCLUSTER_NS" --no-headers 2>/dev/null | \
    awk '{print $1}' | sed 's/-x-.*$//' | sort -u | head -20)
  NS_PREFIX="${VCLUSTER_NS}"
else
  echo "Checking host platform"
  NAMESPACES="forgejo woodpecker headlamp minio oauth2-proxy postgres cnpg-system"
  NS_PREFIX=""
fi
echo ""

# Check pods
echo "Pods:"
for ns in $NAMESPACES; do
  target_ns="${NS_PREFIX:+${NS_PREFIX}}"
  if [ -n "$NS_PREFIX" ]; then
    target_ns="$NS_PREFIX"
  else
    target_ns="$ns"
  fi

  NOT_RUNNING=$(kubectl get pods -n "$target_ns" --no-headers 2>/dev/null | \
    grep -v "Running\|Completed\|Succeeded" | head -5 || echo "")
  if [ -z "$NOT_RUNNING" ]; then
    check "$target_ns pods" "ok"
  else
    BAD=$(echo "$NOT_RUNNING" | awk '{print $1 "(" $3 ")"}' | tr '\n' ' ')
    check "$target_ns pods" "$BAD"
  fi
done

# Check deployments (ready replicas = desired)
echo ""
echo "Deployments:"
for ns in $NAMESPACES; do
  target_ns="${NS_PREFIX:-$ns}"
  DEPLOYS=$(kubectl get deploy -n "$target_ns" --no-headers 2>/dev/null || echo "")
  if [ -z "$DEPLOYS" ]; then
    continue
  fi
  UNREADY=$(echo "$DEPLOYS" | awk '$2 != $4 {print $1 "(" $2 "/" $4 ")"}' | head -5)
  if [ -z "$UNREADY" ]; then
    check "$target_ns deploys" "ok"
  else
    check "$target_ns deploys" "$UNREADY"
  fi
done

# Check ingresses have hosts
echo ""
echo "Ingresses:"
if [ -n "$NS_PREFIX" ]; then
  INGRESSES=$(kubectl get ingress -n "$NS_PREFIX" --no-headers 2>/dev/null || echo "")
else
  INGRESSES=$(kubectl get ingress --all-namespaces --no-headers 2>/dev/null | \
    grep -E "forgejo|woodpecker|headlamp|minio|oauth2" || echo "")
fi

if [ -n "$INGRESSES" ]; then
  NO_HOST=$(echo "$INGRESSES" | awk '$3 == "" || $3 == "*" {print $1}' | head -5)
  if [ -z "$NO_HOST" ]; then
    HOST_COUNT=$(echo "$INGRESSES" | wc -l | tr -d ' ')
    check "ingresses (${HOST_COUNT} found)" "ok"
  else
    check "ingresses" "missing hosts: $NO_HOST"
  fi
else
  check "ingresses" "none found"
fi

# Check CNPG cluster
echo ""
echo "Database:"
PG_PODS=0
if [ -n "$NS_PREFIX" ]; then
  PG_PODS=$(kubectl get pods -n "$NS_PREFIX" --no-headers 2>/dev/null | grep "postgres" | grep -c "Running" 2>/dev/null) || PG_PODS=0
else
  PG_PODS=$(kubectl get pods -n postgres --no-headers 2>/dev/null | grep -c "Running" 2>/dev/null) || PG_PODS=0
  # Host platform may run postgres inside vClusters
  if [ "$PG_PODS" -eq 0 ]; then
    PG_PODS=$(kubectl get pods --all-namespaces --no-headers 2>/dev/null | grep "postgres.*Running" | grep -c "vc-" 2>/dev/null) || PG_PODS=0
  fi
fi
if [ "$PG_PODS" -gt 0 ]; then
  check "postgres ($PG_PODS pods)" "ok"
else
  check "postgres" "no running pods"
fi

echo ""
echo "${PASS}/${TOTAL} passed, ${FAIL} failed"
[ "$FAIL" -eq 0 ]
