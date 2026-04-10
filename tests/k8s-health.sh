#!/usr/bin/env bash
set -euo pipefail

# K8s health check: verifies pods, deployments, and ingresses are healthy.
# Requires kubectl with cluster access.
#
# Usage:
#   ./tests/k8s-health.sh

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

NAMESPACES="forgejo woodpecker minio oauth2-proxy postgres cnpg-system"
echo "Checking platform health"
echo ""

# Check pods
echo "Pods:"
for ns in $NAMESPACES; do
  NOT_RUNNING=$(kubectl get pods -n "$ns" --no-headers 2>/dev/null | \
    grep -v "Running\|Completed\|Succeeded" | head -5 || echo "")
  if [ -z "$NOT_RUNNING" ]; then
    check "$ns pods" "ok"
  else
    BAD=$(echo "$NOT_RUNNING" | awk '{print $1 "(" $3 ")"}' | tr '\n' ' ')
    check "$ns pods" "$BAD"
  fi
done

# Check deployments (ready replicas = desired)
echo ""
echo "Deployments:"
for ns in $NAMESPACES; do
  DEPLOYS=$(kubectl get deploy -n "$ns" --no-headers 2>/dev/null || echo "")
  if [ -z "$DEPLOYS" ]; then
    continue
  fi
  UNREADY=$(echo "$DEPLOYS" | awk '{split($2,a,"/"); if(a[1]!=a[2]) print $1 "(" $2 ")"}' | head -5)
  if [ -z "$UNREADY" ]; then
    check "$ns deploys" "ok"
  else
    check "$ns deploys" "$UNREADY"
  fi
done

# Check ingresses have hosts
echo ""
echo "Ingresses:"
INGRESSES=$(kubectl get ingress --all-namespaces --no-headers 2>/dev/null | \
  grep -E "forgejo|woodpecker|minio|oauth2" || echo "")

if [ -n "$INGRESSES" ]; then
  NO_HOST=$(echo "$INGRESSES" | awk '$4 == "" || $4 == "*" {print $1}' | head -5)
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
PG_PODS=$(kubectl get pods -n postgres --no-headers 2>/dev/null | grep -c "Running" 2>/dev/null) || PG_PODS=0
if [ "$PG_PODS" -gt 0 ]; then
  check "postgres ($PG_PODS pods)" "ok"
else
  check "postgres" "no running pods"
fi

echo ""
echo "${PASS}/${TOTAL} passed, ${FAIL} failed"
[ "$FAIL" -eq 0 ]
