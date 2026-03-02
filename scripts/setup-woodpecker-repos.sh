#!/usr/bin/env bash
set -euo pipefail

# Creates a Forgejo API token for Woodpecker integration.
# Repo activation and CI secrets require logging into Woodpecker first.
# Idempotent — skips resources that already exist.
# Runs as a woodpecker postsync hook after the server is ready.

FORGEJO_URL="https://forgejo.dev.test"
FORGEJO_API="${FORGEJO_URL}/api/v1"
WP_URL="http://ci.dev.test"

ADMIN_USER=$(kubectl get secret forgejo-admin-credentials -n forgejo -o jsonpath='{.data.username}' | base64 -d)
ADMIN_PASS=$(kubectl get secret forgejo-admin-credentials -n forgejo -o jsonpath='{.data.password}' | base64 -d)

forgejo_api() {
  curl -fsSk -u "${ADMIN_USER}:${ADMIN_PASS}" "$@"
}

# ── Wait for Woodpecker API ──────────────────────────────────────────────────

echo "Waiting for Woodpecker API..."
for i in $(seq 1 30); do
  if curl -fsSk "${WP_URL}/healthz" >/dev/null 2>&1; then
    echo "Woodpecker API is ready."
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "Warning: Woodpecker API not responding — skipping repo setup."
    exit 0
  fi
  sleep 2
done

# ── Wait for Forgejo API ─────────────────────────────────────────────────────

echo "Waiting for Forgejo API..."
for i in $(seq 1 30); do
  if forgejo_api "${FORGEJO_API}/settings/api" >/dev/null 2>&1; then
    echo "Forgejo API is ready."
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "Warning: Forgejo API not responding — skipping repo setup."
    exit 0
  fi
  sleep 2
done

# ── Get or create a Forgejo personal access token ────────────────────────────

TOKEN_NAME="woodpecker-bootstrap"
FORGEJO_TOKEN=""

# Check if token already exists (we can't retrieve the value, so check K8s secret)
if kubectl get secret woodpecker-bootstrap-token -n woodpecker -o jsonpath='{.data.token}' 2>/dev/null | base64 -d >/dev/null 2>&1; then
  FORGEJO_TOKEN=$(kubectl get secret woodpecker-bootstrap-token -n woodpecker -o jsonpath='{.data.token}' | base64 -d)
  echo "Using existing Forgejo token."
else
  # Delete any stale token with the same name (can't reuse without the value)
  EXISTING_TOKENS=$(forgejo_api "${FORGEJO_API}/users/${ADMIN_USER}/tokens" 2>/dev/null || echo "[]")
  TOKEN_ID=$(echo "$EXISTING_TOKENS" | jq -r --arg name "$TOKEN_NAME" '.[] | select(.name == $name) | .id // empty')
  if [ -n "$TOKEN_ID" ]; then
    forgejo_api -X DELETE "${FORGEJO_API}/users/${ADMIN_USER}/tokens/${TOKEN_ID}" >/dev/null 2>&1 || true
  fi

  echo "Creating Forgejo personal access token..."
  TOKEN_RESPONSE=$(forgejo_api -X POST "${FORGEJO_API}/users/${ADMIN_USER}/tokens" \
    -H "Content-Type: application/json" \
    -d "{\"name\": \"${TOKEN_NAME}\", \"scopes\": [\"read:user\", \"write:repository\", \"read:organization\"]}")
  FORGEJO_TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.sha1')

  # Store token in K8s secret for reuse across deploys
  kubectl create secret generic woodpecker-bootstrap-token -n woodpecker \
    --from-literal=token="${FORGEJO_TOKEN}" \
    --dry-run=client -o yaml | kubectl apply -f -
  echo "Created and stored Forgejo token."
fi

# ── Attempt Woodpecker repo activation ───────────────────────────────────────
# Woodpecker API requires its own auth token (obtained via Forgejo OAuth2 login).
# On first deploy, repos won't be synced until the user logs into Woodpecker.
# This section uses the Woodpecker API token if available, otherwise prints instructions.

WP_TOKEN=""
if kubectl get secret woodpecker-api-token -n woodpecker -o jsonpath='{.data.token}' 2>/dev/null | base64 -d >/dev/null 2>&1; then
  WP_TOKEN=$(kubectl get secret woodpecker-api-token -n woodpecker -o jsonpath='{.data.token}' | base64 -d)
fi

REPOS=("system/social" "system/demo-app")

if [ -n "$WP_TOKEN" ]; then
  wp_api() {
    curl -fsSk -H "Authorization: Bearer ${WP_TOKEN}" "$@"
  }

  for REPO_FULL in "${REPOS[@]}"; do
    WP_REPO=$(wp_api "${WP_URL}/api/repos/lookup/${REPO_FULL}" 2>/dev/null || echo "")

    if [ -n "$WP_REPO" ] && echo "$WP_REPO" | jq -e '.id' >/dev/null 2>&1; then
      IS_ACTIVE=$(echo "$WP_REPO" | jq -r '.active // false')
      if [ "$IS_ACTIVE" = "true" ]; then
        echo "Repo '${REPO_FULL}' already active in Woodpecker."
      else
        REPO_ID=$(echo "$WP_REPO" | jq -r '.id')
        wp_api -X POST "${WP_URL}/api/repos" \
          -H "Content-Type: application/json" \
          -d "{\"id\": ${REPO_ID}}" >/dev/null 2>&1 || true
        echo "Activated '${REPO_FULL}' in Woodpecker."
      fi
    else
      echo "Repo '${REPO_FULL}' not found in Woodpecker — it may need to sync first."
    fi
  done

  # Create CI secrets for repos
  for REPO_FULL in "${REPOS[@]}"; do
    for SECRET_NAME in registry_username registry_token; do
      EXISTING=$(wp_api "${WP_URL}/api/repos/${REPO_FULL}/secrets/${SECRET_NAME}" 2>/dev/null || echo "")
      if [ -n "$EXISTING" ] && echo "$EXISTING" | jq -e '.name' >/dev/null 2>&1; then
        echo "Secret '${SECRET_NAME}' already exists for '${REPO_FULL}'."
        continue
      fi

      case "$SECRET_NAME" in
        registry_username) VALUE="${ADMIN_USER}" ;;
        registry_token) VALUE="${ADMIN_PASS}" ;;
      esac

      wp_api -X POST "${WP_URL}/api/repos/${REPO_FULL}/secrets" \
        -H "Content-Type: application/json" \
        -d "{\"name\": \"${SECRET_NAME}\", \"value\": \"${VALUE}\", \"events\": [\"push\", \"pull_request\", \"manual\"]}" >/dev/null 2>&1 || true
      echo "Created secret '${SECRET_NAME}' for '${REPO_FULL}'."
    done
  done
else
  echo ""
  echo "Woodpecker repo activation requires a one-time login:"
  echo "  1. Open https://ci.dev.test and sign in with Forgejo"
  echo "  2. Activate repos: system/social, system/demo-app"
  echo "  3. Add secrets to each repo (Settings > Secrets):"
  echo "     - registry_username = (Forgejo admin username)"
  echo "     - registry_token = (Forgejo admin password)"
  echo "  4. Push to a repo or trigger a manual pipeline to start CI"
  echo ""
fi

echo "Woodpecker setup complete."
