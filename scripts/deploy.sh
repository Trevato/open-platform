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
  if [ -t 0 ]; then
    echo ""
    echo "  Open Platform"
    echo ""
    printf "  ? Domain: "
    read -r DOMAIN_INPUT
    if [ -z "${DOMAIN_INPUT}" ]; then
      echo "Error: Domain cannot be empty."
      exit 1
    fi
    cat > "$ROOT_DIR/open-platform.yaml" <<EOF
domain: "${DOMAIN_INPUT}"
EOF
    echo ""
    echo "Phase 0: Generating config from open-platform.yaml..."
    "${SCRIPT_DIR}/generate-config.sh"
    echo ""
  else
    echo "Error: No open-platform.yaml or .env found."
    echo ""
    echo "Quick start:  cp open-platform.yaml.example open-platform.yaml"
    exit 1
  fi
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
PREFIX="${SERVICE_PREFIX:-}"
echo ""
echo "=== Deploy complete in $((END - START))s ==="
echo ""
echo "  Console:  https://${PREFIX}console.${DOMAIN}"
echo "  Forgejo:  https://${PREFIX}forgejo.${DOMAIN}"
echo "  CI/CD:    https://${PREFIX}ci.${DOMAIN}"
echo ""
echo "  Admin:    ${FORGEJO_ADMIN_USER}"
echo "  Password: ${FORGEJO_ADMIN_PASSWORD:-see open-platform.state.yaml}"
echo ""
echo "  Configure: https://${PREFIX}console.${DOMAIN}/dashboard/settings"
echo ""
echo "  If DNS isn't configured yet:"
echo "    kubectl port-forward -n op-system-console svc/console 3000:80"
echo "    → http://localhost:3000/dashboard/settings"
echo ""
