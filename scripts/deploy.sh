#!/usr/bin/env bash
set -euo pipefail

# Orchestrates the full Open Platform deploy:
#   0. Generate config from open-platform.yaml (if present)
#   1. helmfile sync (bootstrap everything)
#   2. k3s OIDC + container registry setup
#   3. Woodpecker setup + pipeline triggers
#
# Idempotent — safe to run repeatedly.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
START=$(date +%s)

# ── Phase 0: Generate config ──────────────────────────────────────────────────

if [ -f "$ROOT_DIR/open-platform.yaml" ]; then
  echo "Phase 0: Generating config from open-platform.yaml..."
  "${SCRIPT_DIR}/generate-config.sh"
  echo ""
elif [ ! -f "$ROOT_DIR/.env" ]; then
  echo "Error: No open-platform.yaml or .env found."
  echo ""
  echo "Quick start:  cp open-platform.yaml.example open-platform.yaml"
  exit 1
fi

# Load config
set -a
# shellcheck source=/dev/null
source "$ROOT_DIR/.env"
set +a
DOMAIN="${PLATFORM_DOMAIN:?PLATFORM_DOMAIN not set}"

echo "=== Open Platform Deploy (${DOMAIN}) ==="
echo ""

# ── Phase 1: Bootstrap everything ────────────────────────────────────────────

echo "Phase 1: helmfile sync..."
helmfile sync

# ── Phase 2: k3s OIDC + container registry setup ────────────────────────────
# Configures k3s API server for Headlamp OIDC token validation.
# Also installs CA cert and containerd registry config for image pulls.

echo ""
echo "Phase 2: k3s OIDC setup..."
"${SCRIPT_DIR}/setup-oidc.sh"

# ── Phase 3: Woodpecker setup + pipeline triggers ───────────────────────────
# Runs AFTER helmfile so Forgejo and Woodpecker are fully stable.

echo ""
echo "Phase 3: Woodpecker repo setup + pipeline triggers..."
"${SCRIPT_DIR}/setup-woodpecker-repos.sh"

# ── Done ─────────────────────────────────────────────────────────────────────

END=$(date +%s)
echo ""
echo "=== Deploy complete in $((END - START))s ==="
echo ""
echo "Services:"
echo "  Forgejo:    https://forgejo.${DOMAIN}"
echo "  Woodpecker: https://ci.${DOMAIN}"
echo "  Headlamp:   https://headlamp.${DOMAIN}"
echo "  MinIO:      https://minio.${DOMAIN}"
echo ""
echo "Admin: ${FORGEJO_ADMIN_USER}"
echo "Password: see open-platform.state.yaml"
