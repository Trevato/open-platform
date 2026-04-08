#!/usr/bin/env bash
set -euo pipefail

# Smoke test: verifies all platform services respond via HTTPS.
# Fast (<10s), curl-based, no kubectl or browser required.
#
# Usage:
#   PLATFORM_DOMAIN=open-platform.sh ./tests/smoke.sh
#   PLATFORM_DOMAIN=open-platform.sh SERVICE_PREFIX=buster- ./tests/smoke.sh

DOMAIN="${PLATFORM_DOMAIN:?Set PLATFORM_DOMAIN}"
PREFIX="${SERVICE_PREFIX:-}"

PASS=0
FAIL=0
TOTAL=0

check() {
  local name="$1" url="$2" expected="$3"
  TOTAL=$((TOTAL + 1))
  local code
  code=$(curl -sk -o /dev/null -w "%{http_code}" --max-time 10 "$url" 2>/dev/null || echo "000")

  if echo "$expected" | grep -qw "$code"; then
    printf "  \033[32mPASS\033[0m  %-20s %s → %s\n" "$name" "$url" "$code"
    PASS=$((PASS + 1))
  else
    printf "  \033[31mFAIL\033[0m  %-20s %s → %s (expected %s)\n" "$name" "$url" "$code" "$expected"
    FAIL=$((FAIL + 1))
  fi
}

echo "Smoke testing ${PREFIX:+${PREFIX%.}-}${DOMAIN}"
echo ""

# Core services
check "forgejo"    "https://${PREFIX}forgejo.${DOMAIN}/api/v1/settings/api" "200"
check "ci"         "https://${PREFIX}ci.${DOMAIN}/healthz"                  "200 204"
check "minio"      "https://${PREFIX}minio.${DOMAIN}/"                      "200 302 307"
check "s3"         "https://${PREFIX}s3.${DOMAIN}/"                         "200 403"
check "oauth2"     "https://${PREFIX}oauth2.${DOMAIN}/ping"                 "200"

# Discover deployed apps (workload namespaces)
if command -v kubectl >/dev/null 2>&1; then
  APPS=$(kubectl get ns -l open-platform.sh/tier=workload -o jsonpath='{.items[*].metadata.labels.open-platform\.sh/repo}' 2>/dev/null || echo "")
  for app in $APPS; do
    check "app:${app}" "https://${PREFIX}${app}.${DOMAIN}/" "200 302 307"
  done
fi

echo ""
echo "${PASS}/${TOTAL} passed, ${FAIL} failed"
[ "$FAIL" -eq 0 ]
