#!/usr/bin/env bash
set -euo pipefail

# Automates Woodpecker CI setup: login, repo activation, org secrets.
# Uses programmatic OAuth2 flow (Forgejo → Woodpecker) to obtain API credentials.
# Idempotent — skips resources that already exist.
# Runs as a woodpecker postsync hook.

FORGEJO_URL="https://forgejo.dev.test"
FORGEJO_API="${FORGEJO_URL}/api/v1"
WP_URL="http://ci.dev.test"

ADMIN_USER=$(kubectl get secret forgejo-admin-credentials -n forgejo -o jsonpath='{.data.username}' | base64 -d)
ADMIN_PASS=$(kubectl get secret forgejo-admin-credentials -n forgejo -o jsonpath='{.data.password}' | base64 -d)

forgejo_api() {
  curl -fsSk -u "${ADMIN_USER}:${ADMIN_PASS}" "$@"
}

# ── Wait for both APIs ────────────────────────────────────────────────────────

echo "Waiting for Woodpecker API..."
for i in $(seq 1 30); do
  if curl -fsSk "${WP_URL}/healthz" >/dev/null 2>&1; then
    echo "Woodpecker API is ready."
    break
  fi
  [ "$i" -eq 30 ] && { echo "Warning: Woodpecker API not responding — skipping."; exit 0; }
  sleep 2
done

echo "Waiting for Forgejo API..."
for i in $(seq 1 30); do
  if forgejo_api "${FORGEJO_API}/settings/api" >/dev/null 2>&1; then
    echo "Forgejo API is ready."
    break
  fi
  [ "$i" -eq 30 ] && { echo "Warning: Forgejo API not responding — skipping."; exit 0; }
  sleep 2
done

# ── Phase 1: Woodpecker login via programmatic OAuth2 flow ────────────────────

COOKIE_DIR=$(mktemp -d)
trap "rm -rf ${COOKIE_DIR}" EXIT
FORGEJO_COOKIES="${COOKIE_DIR}/forgejo"
WP_COOKIES="${COOKIE_DIR}/woodpecker"

WP_TOKEN=""
WP_SESSION=""
WP_CSRF=""

# Check for existing API token
if kubectl get secret woodpecker-api-token -n woodpecker -o jsonpath='{.data.token}' 2>/dev/null | base64 -d >/dev/null 2>&1; then
  WP_TOKEN=$(kubectl get secret woodpecker-api-token -n woodpecker -o jsonpath='{.data.token}' | base64 -d)
  echo "Using existing Woodpecker API token."
fi

# Always establish a session (needed for repo activation which requires session+CSRF)
echo "Logging into Woodpecker via Forgejo OAuth2..."

# Step 1: Login to Forgejo
curl -sSk -c "${FORGEJO_COOKIES}" -X POST \
  -d "user_name=${ADMIN_USER}&password=${ADMIN_PASS}" \
  -o /dev/null "https://forgejo.dev.test/user/login"

# Step 2: Complete OAuth2 flow (Forgejo → Woodpecker callback)
curl -sSk -b "${FORGEJO_COOKIES}" -c "${WP_COOKIES}" -L \
  -o /dev/null "${WP_URL}/authorize"

# Step 3: Extract session and CSRF
WP_SESSION=$(grep user_sess "${WP_COOKIES}" 2>/dev/null | awk '{print $NF}' || echo "")
WP_CSRF=$(curl -sSk -b "${WP_COOKIES}" "${WP_URL}/web-config.js" 2>/dev/null \
  | grep WOODPECKER_CSRF | sed 's/.*= "//;s/".*//' || echo "")

if [ -z "$WP_SESSION" ] || [ -z "$WP_CSRF" ]; then
  echo "Warning: Could not establish Woodpecker session — skipping."
  exit 0
fi

echo "Woodpecker session established."

# Step 4: Create API token if we don't have one
if [ -z "$WP_TOKEN" ]; then
  echo "Creating Woodpecker API token..."
  WP_TOKEN=$(curl -sSk -X POST \
    -b "user_sess=${WP_SESSION}" \
    -H "X-CSRF-Token: ${WP_CSRF}" \
    "${WP_URL}/api/user/token" 2>/dev/null)

  if [ -n "$WP_TOKEN" ] && [ "$WP_TOKEN" != "null" ]; then
    kubectl create secret generic woodpecker-api-token -n woodpecker \
      --from-literal=token="${WP_TOKEN}" \
      --dry-run=client -o yaml | kubectl apply -f -
    echo "Created and stored Woodpecker API token."
  else
    echo "Warning: Failed to create Woodpecker API token."
    exit 0
  fi
fi

# Helper: session+CSRF auth (for repo activation)
wp_session() {
  curl -sSk -b "user_sess=${WP_SESSION}" -H "X-CSRF-Token: ${WP_CSRF}" "$@"
}

# Helper: Bearer token auth (for secrets and queries)
wp_api() {
  curl -fsSk -H "Authorization: Bearer ${WP_TOKEN}" "$@"
}

# ── Phase 2: Repo activation ─────────────────────────────────────────────────

REPOS=("system/social" "system/demo-app")

for REPO_FULL in "${REPOS[@]}"; do
  # Check if already active
  WP_REPO=$(wp_api "${WP_URL}/api/repos/lookup/${REPO_FULL}" 2>/dev/null || echo "")
  if [ -n "$WP_REPO" ] && echo "$WP_REPO" | jq -e '.active == true' >/dev/null 2>&1; then
    echo "Repo '${REPO_FULL}' already active in Woodpecker."
    continue
  fi

  # Get forge_remote_id from Forgejo
  FORGE_ID=$(forgejo_api "${FORGEJO_API}/repos/${REPO_FULL}" 2>/dev/null | jq -r '.id // empty')
  if [ -z "$FORGE_ID" ]; then
    echo "Warning: Repo '${REPO_FULL}' not found in Forgejo — skipping."
    continue
  fi

  # Activate (requires session+CSRF, not Bearer)
  RESULT=$(wp_session -X POST "${WP_URL}/api/repos?forge_remote_id=${FORGE_ID}" 2>/dev/null)
  if echo "$RESULT" | jq -e '.active == true' >/dev/null 2>&1; then
    echo "Activated '${REPO_FULL}' in Woodpecker."
  else
    echo "Warning: Failed to activate '${REPO_FULL}': $(echo "$RESULT" | head -1)"
  fi
done

# ── Phase 3: Org-level secrets ────────────────────────────────────────────────
# Org secrets are inherited by all repos — no per-repo setup needed.

ORG_ID=$(wp_api "${WP_URL}/api/orgs" 2>/dev/null | jq -r '.[0].id // empty')
if [ -z "$ORG_ID" ]; then
  echo "Warning: No Woodpecker org found — skipping secrets."
  exit 0
fi

for SECRET_NAME in registry_username registry_token; do
  EXISTING=$(wp_api "${WP_URL}/api/orgs/${ORG_ID}/secrets/${SECRET_NAME}" 2>/dev/null || echo "")
  if [ -n "$EXISTING" ] && echo "$EXISTING" | jq -e '.name' >/dev/null 2>&1; then
    echo "Org secret '${SECRET_NAME}' already exists."
    continue
  fi

  case "$SECRET_NAME" in
    registry_username) VALUE="${ADMIN_USER}" ;;
    registry_token) VALUE="${ADMIN_PASS}" ;;
  esac

  wp_api -X POST "${WP_URL}/api/orgs/${ORG_ID}/secrets" \
    -H "Content-Type: application/json" \
    -d "{\"name\": \"${SECRET_NAME}\", \"value\": \"${VALUE}\", \"events\": [\"push\", \"pull_request\", \"manual\"]}" >/dev/null 2>&1
  echo "Created org secret '${SECRET_NAME}'."
done

# ── Phase 4: Trigger social PR pipeline ───────────────────────────────────────
# Close and reopen the PR to fire the webhook now that repos are active.

PR_STATE=$(forgejo_api "${FORGEJO_API}/repos/system/social/pulls?state=open&head=feat/markdown-posts" 2>/dev/null | jq -r '.[0].number // empty')
if [ -n "$PR_STATE" ]; then
  echo "Triggering social PR pipeline..."
  forgejo_api -X PATCH "${FORGEJO_API}/repos/system/social/pulls/${PR_STATE}" \
    -H "Content-Type: application/json" \
    -d '{"state":"closed"}' >/dev/null 2>&1
  sleep 1
  forgejo_api -X PATCH "${FORGEJO_API}/repos/system/social/pulls/${PR_STATE}" \
    -H "Content-Type: application/json" \
    -d '{"state":"open"}' >/dev/null 2>&1
  echo "Social PR reopened — pipeline should trigger."
fi

echo "Woodpecker setup complete."
