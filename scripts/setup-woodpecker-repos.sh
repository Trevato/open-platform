#!/usr/bin/env bash
set -euo pipefail

# Automates Woodpecker CI setup: login, repo activation, org secrets, pipeline triggers.
# Uses programmatic OAuth2 flow (Forgejo → Woodpecker) to obtain API credentials.
# Idempotent — skips resources that already exist.
# Runs from deploy.sh after all services are stable.

FORGEJO_INTERNAL_URL="https://forgejo.dev.test"
FORGEJO_API="${FORGEJO_INTERNAL_URL}/api/v1"
WP_INTERNAL_URL="http://ci.dev.test"

# Woodpecker sets WOODPECKER_HOST and WOODPECKER_FORGEJO_URL for OAuth2 redirects.
# The OAuth callback lands on WOODPECKER_HOST, so session cookies bind to that domain.
# We must use the SAME domain for all subsequent session-authenticated requests.
# Try: statefulset env → pod env exec → fallback to internal.
WP_HOST=$(kubectl get statefulset woodpecker-server -n woodpecker -o jsonpath='{.spec.template.spec.containers[0].env[?(@.name=="WOODPECKER_HOST")].value}' 2>/dev/null || echo "")
FORGEJO_OAUTH_URL=$(kubectl get statefulset woodpecker-server -n woodpecker -o jsonpath='{.spec.template.spec.containers[0].env[?(@.name=="WOODPECKER_FORGEJO_URL")].value}' 2>/dev/null || echo "")

if [ -z "$WP_HOST" ]; then
  WP_HOST=$(kubectl exec statefulset/woodpecker-server -n woodpecker -- printenv WOODPECKER_HOST 2>/dev/null || echo "")
fi
if [ -z "$FORGEJO_OAUTH_URL" ]; then
  FORGEJO_OAUTH_URL=$(kubectl exec statefulset/woodpecker-server -n woodpecker -- printenv WOODPECKER_FORGEJO_URL 2>/dev/null || echo "")
fi

# Fallback to internal URLs if env vars not found
WP_HOST="${WP_HOST:-$WP_INTERNAL_URL}"
FORGEJO_OAUTH_URL="${FORGEJO_OAUTH_URL:-$FORGEJO_INTERNAL_URL}"

# Use WP_HOST for session-authenticated requests (cookies match callback domain)
# Use WP_INTERNAL_URL for healthchecks and non-session API calls
WP_URL="$WP_HOST"

ADMIN_USER=$(kubectl get secret forgejo-admin-credentials -n forgejo -o jsonpath='{.data.username}' | base64 -d)
ADMIN_PASS=$(kubectl get secret forgejo-admin-credentials -n forgejo -o jsonpath='{.data.password}' | base64 -d)

forgejo_api() {
  curl -fsSk -u "${ADMIN_USER}:${ADMIN_PASS}" "$@"
}

forgejo_oauth_api() {
  curl -fsSk -u "${ADMIN_USER}:${ADMIN_PASS}" "${FORGEJO_OAUTH_URL}/api/v1/$1" "${@:2}"
}

# ── Wait for both APIs ────────────────────────────────────────────────────────

echo "Waiting for Woodpecker API..."
for i in $(seq 1 30); do
  if curl -fsSk "${WP_INTERNAL_URL}/healthz" >/dev/null 2>&1; then
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

# Verify Forgejo can serve git operations (not just API)
echo "Verifying Forgejo git readiness..."
for i in $(seq 1 15); do
  if GIT_SSL_NO_VERIFY=1 git ls-remote "https://${ADMIN_USER}:${ADMIN_PASS}@$(echo "$FORGEJO_INTERNAL_URL" | sed 's|https://||')/system/open-platform.git" HEAD >/dev/null 2>&1; then
    echo "Forgejo git service is ready."
    break
  fi
  [ "$i" -eq 15 ] && { echo "Warning: Forgejo git not responding — pipelines may fail."; }
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

# Check for existing API token and validate it
if kubectl get secret woodpecker-api-token -n woodpecker -o jsonpath='{.data.token}' 2>/dev/null | base64 -d >/dev/null 2>&1; then
  SAVED_TOKEN=$(kubectl get secret woodpecker-api-token -n woodpecker -o jsonpath='{.data.token}' | base64 -d)
  if curl -fsSk -H "Authorization: Bearer ${SAVED_TOKEN}" "${WP_INTERNAL_URL}/api/user" >/dev/null 2>&1; then
    WP_TOKEN="$SAVED_TOKEN"
    echo "Using existing Woodpecker API token (validated)."
  else
    echo "Saved Woodpecker API token is stale — will create a new one."
  fi
fi

# Always establish a session (needed for repo activation which requires session+CSRF)
echo "Logging into Woodpecker via Forgejo OAuth2..."

# Step 1: Login to Forgejo at the OAuth domain (must match where Woodpecker redirects)
echo "  Forgejo OAuth URL: ${FORGEJO_OAUTH_URL}"
curl -sSk -c "${FORGEJO_COOKIES}" -L \
  -d "user_name=${ADMIN_USER}&password=${ADMIN_PASS}" \
  -o /dev/null "${FORGEJO_OAUTH_URL}/user/login"

# Step 2: Start OAuth2 flow — get Forgejo authorize URL from Woodpecker redirect
AUTHORIZE_URL=$(curl -sSk -b "${FORGEJO_COOKIES}" -o /dev/null -D - "${WP_URL}/authorize" 2>&1 \
  | grep -i '^location:' | tr -d '\r' | awk '{print $2}')

if [ -z "$AUTHORIZE_URL" ]; then
  echo "Warning: Woodpecker did not redirect to Forgejo — skipping."
  exit 0
fi

# Step 3: Fetch Forgejo authorize — may show grant page (first time) or auto-redirect (already authorized)
AUTHORIZE_HEADERS=$(curl -sSk -b "${FORGEJO_COOKIES}" -c "${FORGEJO_COOKIES}" \
  -o "${COOKIE_DIR}/grant_body" -D - "${AUTHORIZE_URL}" 2>&1)

AUTHORIZE_STATUS=$(echo "$AUTHORIZE_HEADERS" | grep -E '^HTTP' | tail -1 | awk '{print $2}')

if [ "$AUTHORIZE_STATUS" = "303" ] || [ "$AUTHORIZE_STATUS" = "302" ]; then
  # Already authorized — Forgejo redirected with auth code. Follow the callback.
  CALLBACK_URL=$(echo "$AUTHORIZE_HEADERS" | grep -i '^location:' | tr -d '\r' | awk '{print $2}')
  curl -sSk -b "${FORGEJO_COOKIES}" -c "${WP_COOKIES}" -L \
    -o /dev/null "${CALLBACK_URL}"
else
  # First time — grant page shown. Extract form fields and submit.
  GRANT_PAGE=$(cat "${COOKIE_DIR}/grant_body")
  GRANT_STATE=$(echo "$GRANT_PAGE" | sed -n 's/.*name="state" value="\([^"]*\)".*/\1/p')
  GRANT_CLIENT=$(echo "$GRANT_PAGE" | sed -n 's/.*name="client_id" value="\([^"]*\)".*/\1/p')
  GRANT_REDIRECT=$(echo "$GRANT_PAGE" | sed -n 's/.*name="redirect_uri" value="\([^"]*\)".*/\1/p')

  if [ -z "$GRANT_STATE" ] || [ -z "$GRANT_CLIENT" ]; then
    echo "Warning: Could not parse Forgejo grant page — skipping."
    exit 0
  fi

  # Submit grant form — Forgejo redirects to Woodpecker callback with auth code
  curl -sSk -b "${FORGEJO_COOKIES}" -c "${WP_COOKIES}" -L \
    --data-urlencode "client_id=${GRANT_CLIENT}" \
    --data-urlencode "state=${GRANT_STATE}" \
    --data-urlencode "scope=" \
    --data-urlencode "nonce=" \
    --data-urlencode "redirect_uri=${GRANT_REDIRECT}" \
    --data-urlencode "granted=true" \
    -o /dev/null "${FORGEJO_OAUTH_URL}/login/oauth/grant"
fi

# Step 4: Extract session and CSRF
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

# Discover all system org repos (except open-platform and template)
REPO_LIST=$(forgejo_api "${FORGEJO_API}/orgs/system/repos?limit=50" 2>/dev/null | \
  jq -r '.[].full_name' 2>/dev/null | \
  grep -v "^system/open-platform$" | \
  grep -v "^system/template$" || true)

if [ -z "$REPO_LIST" ]; then
  echo "No deployable repos found in system org — skipping activation."
  REPOS=()
else
  REPOS=()
  while IFS= read -r line; do
    REPOS+=("$line")
  done <<< "$REPO_LIST"
fi

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

# ── Phase 4: Trigger pipelines ────────────────────────────────────────────────
# Trigger main branch deploys via Woodpecker API (manual event).
# Trigger social PR preview via webhook (close/reopen).
# Uses numeric repo IDs with retry for Forgejo readiness.

echo ""
echo "Triggering CI pipelines..."

trigger_main_pipeline() {
  local REPO_FULL="$1"

  # Get numeric repo ID via lookup
  local REPO_ID
  REPO_ID=$(wp_api "${WP_URL}/api/repos/lookup/${REPO_FULL}" 2>/dev/null | jq -r '.id // empty')
  if [ -z "$REPO_ID" ]; then
    echo "Warning: Could not find repo ID for '${REPO_FULL}' — skipping."
    return 1
  fi

  # Check if a successful deploy pipeline already exists
  local DEPLOY_OK
  DEPLOY_OK=$(wp_api "${WP_URL}/api/repos/${REPO_ID}/pipelines" 2>/dev/null | \
    jq -r '[.[] | select((.event == "push" or .event == "manual") and .status == "success")] | length' 2>/dev/null || echo "0")
  if [ "$DEPLOY_OK" != "0" ]; then
    echo "Repo '${REPO_FULL}' already has a successful deploy — skipping."
    return 0
  fi

  echo "Triggering main branch pipeline for '${REPO_FULL}'..."
  local RESULT
  for attempt in $(seq 1 5); do
    RESULT=$(wp_api -X POST "${WP_URL}/api/repos/${REPO_ID}/pipelines" \
      -H "Content-Type: application/json" \
      -d '{"branch": "main"}' 2>/dev/null || echo "")

    if [ -n "$RESULT" ] && echo "$RESULT" | jq -e '.id' >/dev/null 2>&1; then
      local PIPELINE_ID
      PIPELINE_ID=$(echo "$RESULT" | jq -r '.id')
      echo "Triggered pipeline #${PIPELINE_ID} for '${REPO_FULL}'."
      return 0
    fi

    [ "$attempt" -lt 5 ] && { echo "  Retry ${attempt}/5 — waiting for Forgejo..."; sleep 5; }
  done

  echo "Warning: Failed to trigger pipeline for '${REPO_FULL}' after 5 attempts."
  return 1
}

if [ ${#REPOS[@]} -gt 0 ]; then
  for REPO_FULL in "${REPOS[@]}"; do
    trigger_main_pipeline "$REPO_FULL" || true
  done
fi

# Trigger social PR preview pipeline (close/reopen to fire webhook)
PR_NUMBER=$(forgejo_api "${FORGEJO_API}/repos/system/social/pulls?state=open&head=feat/markdown-posts" 2>/dev/null | jq -r '.[0].number // empty')
if [ -n "$PR_NUMBER" ]; then
  # Check if a successful PR pipeline already exists
  SOCIAL_ID=$(wp_api "${WP_URL}/api/repos/lookup/system/social" 2>/dev/null | jq -r '.id // empty')
  PR_PIPELINE=$(wp_api "${WP_URL}/api/repos/${SOCIAL_ID}/pipelines" 2>/dev/null | \
    jq -r '[.[] | select(.event == "pull_request" and .status == "success")] | length' 2>/dev/null || echo "0")

  if [ "$PR_PIPELINE" != "0" ]; then
    echo "Social PR already has a successful preview pipeline — skipping trigger."
  else
    echo "Triggering social PR preview pipeline..."
    forgejo_api -X PATCH "${FORGEJO_API}/repos/system/social/pulls/${PR_NUMBER}" \
      -H "Content-Type: application/json" \
      -d '{"state":"closed"}' >/dev/null 2>&1
    sleep 1
    forgejo_api -X PATCH "${FORGEJO_API}/repos/system/social/pulls/${PR_NUMBER}" \
      -H "Content-Type: application/json" \
      -d '{"state":"open"}' >/dev/null 2>&1
    echo "Social PR reopened — preview pipeline triggered."
  fi
fi

echo ""
echo "Woodpecker setup complete. Pipelines running in background."
