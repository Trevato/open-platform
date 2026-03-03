#!/usr/bin/env bash
set -euo pipefail

# Orchestrates the full Open Platform deploy:
#   1. helmfile sync (bootstrap everything)
#   2. OIDC config (may restart k3s)
#   3. Recovery helmfile sync (only if k3s restarted)
#   4. Woodpecker setup + pipeline triggers (after everything is stable)
#
# Idempotent — safe to run repeatedly.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
START=$(date +%s)

echo "=== Open Platform Deploy ==="
echo ""

# ── Phase 1: Bootstrap everything ────────────────────────────────────────────

echo "Phase 1: helmfile sync..."
helmfile sync

# ── Phase 2: OIDC configuration ─────────────────────────────────────────────

echo ""
echo "Phase 2: OIDC configuration..."
OIDC_OUTPUT=$("${SCRIPT_DIR}/setup-oidc.sh" 2>&1) || true
echo "$OIDC_OUTPUT"

# ── Phase 3: Recovery (only if k3s restarted) ───────────────────────────────

if echo "$OIDC_OUTPUT" | grep -q "Restarting k3s"; then
  echo ""
  echo "Phase 3: Recovering helm state after k3s restart..."
  if helmfile sync; then
    echo "Recovery sync complete."
  else
    echo "Recovery sync had non-critical errors (hooks may re-run on next deploy)."
  fi

  # Restart Woodpecker to clear stale queue/gRPC state from the k3s restart cycle
  echo "Restarting Woodpecker for clean pipeline state..."
  kubectl rollout restart statefulset/woodpecker-server -n woodpecker 2>/dev/null || true
  kubectl rollout restart statefulset/woodpecker-agent -n woodpecker 2>/dev/null || true
  kubectl rollout status statefulset/woodpecker-server -n woodpecker --timeout=120s 2>/dev/null || true
  kubectl rollout status statefulset/woodpecker-agent -n woodpecker --timeout=120s 2>/dev/null || true
fi

# ── Phase 4: Woodpecker setup + pipeline triggers ───────────────────────────
# Runs AFTER recovery so Forgejo and Woodpecker are fully stable.

echo ""
echo "Phase 4: Woodpecker repo setup + pipeline triggers..."
"${SCRIPT_DIR}/setup-woodpecker-repos.sh"

# ── Done ─────────────────────────────────────────────────────────────────────

END=$(date +%s)
echo ""
echo "=== Deploy complete in $((END - START))s ==="
