#!/usr/bin/env bash
set -euo pipefail

# Activates repos in Woodpecker and creates CI secrets.
# Idempotent — skips repos and secrets that already exist.
# Runs as a woodpecker postsync hook after the server is ready.

FORGEJO_URL="https://forgejo.dev.test"
FORGEJO_API="${FORGEJO_URL}/api/v1"
WP_URL="http://ci.dev.test"
WP_API="${WP_URL}/api"

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

# ── Get or create a Forgejo personal access token for Woodpecker API ─────────

TOKEN_NAME="woodpecker-bootstrap"
FORGEJO_TOKEN=""

# Check if token already exists (we can't retrieve the value, so check K8s secret)
if kubectl get secret woodpecker-bootstrap-token -n woodpecker -o jsonpath='{.data.token}' 2>/dev/null | base64 -d >/dev/null 2>&1; then
  FORGEJO_TOKEN=$(kubectl get secret woodpecker-bootstrap-token -n woodpecker -o jsonpath='{.data.token}' | base64 -d)
  echo "Using existing Forgejo token for Woodpecker API."
else
  # Delete any stale token with the same name (can't reuse without the value)
  EXISTING_TOKENS=$(forgejo_api "${FORGEJO_API}/user/tokens" 2>/dev/null || echo "[]")
  TOKEN_ID=$(echo "$EXISTING_TOKENS" | jq -r --arg name "$TOKEN_NAME" '.[] | select(.name == $name) | .id // empty')
  if [ -n "$TOKEN_ID" ]; then
    forgejo_api -X DELETE "${FORGEJO_API}/user/tokens/${TOKEN_ID}" >/dev/null 2>&1 || true
  fi

  echo "Creating Forgejo personal access token..."
  TOKEN_RESPONSE=$(forgejo_api -X POST "${FORGEJO_API}/user/tokens" \
    -H "Content-Type: application/json" \
    -d "{\"name\": \"${TOKEN_NAME}\", \"scopes\": [\"all\"]}")
  FORGEJO_TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.sha1')

  # Store token in K8s secret for reuse across deploys
  kubectl create secret generic woodpecker-bootstrap-token -n woodpecker \
    --from-literal=token="${FORGEJO_TOKEN}" \
    --dry-run=client -o yaml | kubectl apply -f -
  echo "Created and stored Forgejo token."
fi

if [ -z "$FORGEJO_TOKEN" ]; then
  echo "Warning: Could not obtain Forgejo token — skipping Woodpecker repo setup."
  exit 0
fi

wp_api() {
  curl -fsSk -H "Authorization: Bearer ${FORGEJO_TOKEN}" "$@"
}

# ── Activate repos in Woodpecker ─────────────────────────────────────────────

REPOS=("system/social" "system/demo-app")

for REPO_FULL in "${REPOS[@]}"; do
  REPO_OWNER="${REPO_FULL%%/*}"
  REPO_NAME="${REPO_FULL##*/}"

  # Look up repo in Woodpecker
  WP_REPO=$(wp_api "${WP_API}/repos/lookup/${REPO_FULL}" 2>/dev/null || echo "")

  if [ -n "$WP_REPO" ] && echo "$WP_REPO" | jq -e '.id' >/dev/null 2>&1; then
    IS_ACTIVE=$(echo "$WP_REPO" | jq -r '.active // false')
    if [ "$IS_ACTIVE" = "true" ]; then
      echo "Repo '${REPO_FULL}' already active in Woodpecker."
    else
      REPO_ID=$(echo "$WP_REPO" | jq -r '.id')
      wp_api -X POST "${WP_API}/repos" \
        -H "Content-Type: application/json" \
        -d "{\"id\": ${REPO_ID}}" >/dev/null 2>&1 || true
      echo "Activated '${REPO_FULL}' in Woodpecker."
    fi
  else
    echo "Repo '${REPO_FULL}' not found in Woodpecker — it may need to sync first."
  fi
done

# ── Create CI secrets for repos ──────────────────────────────────────────────

for REPO_FULL in "${REPOS[@]}"; do
  for SECRET_NAME in registry_username registry_token; do
    EXISTING=$(wp_api "${WP_API}/repos/${REPO_FULL}/secrets/${SECRET_NAME}" 2>/dev/null || echo "")
    if [ -n "$EXISTING" ] && echo "$EXISTING" | jq -e '.name' >/dev/null 2>&1; then
      echo "Secret '${SECRET_NAME}' already exists for '${REPO_FULL}'."
      continue
    fi

    case "$SECRET_NAME" in
      registry_username) VALUE="${ADMIN_USER}" ;;
      registry_token) VALUE="${ADMIN_PASS}" ;;
    esac

    wp_api -X POST "${WP_API}/repos/${REPO_FULL}/secrets" \
      -H "Content-Type: application/json" \
      -d "{\"name\": \"${SECRET_NAME}\", \"value\": \"${VALUE}\", \"events\": [\"push\", \"pull_request\", \"manual\"]}" >/dev/null 2>&1 || true
    echo "Created secret '${SECRET_NAME}' for '${REPO_FULL}'."
  done
done

echo "Woodpecker repo setup complete."
