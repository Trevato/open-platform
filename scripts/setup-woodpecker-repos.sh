#!/usr/bin/env bash
set -euo pipefail

# Automates Woodpecker CI setup: login, repo activation, org secrets, pipeline triggers.
# Uses programmatic OAuth2 flow (Forgejo → Woodpecker) to obtain API credentials.
# Idempotent — skips resources that already exist.
# Runs from deploy.sh after all services are stable.

DOMAIN="${PLATFORM_DOMAIN:?PLATFORM_DOMAIN not set — run generate-config.sh first}"
PREFIX="${SERVICE_PREFIX:-}"

ADMIN_USER=$(kubectl get secret forgejo-admin-credentials -n forgejo -o jsonpath='{.data.username}' | base64 -d)
ADMIN_PASS=$(kubectl get secret forgejo-admin-credentials -n forgejo -o jsonpath='{.data.password}' | base64 -d)

# Use port-forward for both Forgejo and Woodpecker API access (works without DNS)
FORGEJO_LOCAL_PORT=3335
WP_LOCAL_PORT=8001

COOKIE_DIR=$(mktemp -d)
PF_FORGEJO_PID=""
PF_WP_PID=""
trap 'kill $PF_FORGEJO_PID 2>/dev/null || true; kill $PF_WP_PID 2>/dev/null || true; rm -rf ${COOKIE_DIR}' EXIT

# Start port-forwards with retry (critical after k3s restart — kubelet may need time)
start_port_forwards() {
  kill $PF_FORGEJO_PID 2>/dev/null || true
  kill $PF_WP_PID 2>/dev/null || true
  kubectl port-forward -n forgejo svc/forgejo-http ${FORGEJO_LOCAL_PORT}:3000 &>/dev/null &
  PF_FORGEJO_PID=$!
  kubectl port-forward -n woodpecker svc/woodpecker-server ${WP_LOCAL_PORT}:80 &>/dev/null &
  PF_WP_PID=$!
  sleep 3
}

echo "Establishing port-forwards..."
for attempt in $(seq 1 10); do
  start_port_forwards
  # Verify both port-forwards are alive and responsive
  if kill -0 $PF_FORGEJO_PID 2>/dev/null && kill -0 $PF_WP_PID 2>/dev/null; then
    if curl -fsSk "http://localhost:${FORGEJO_LOCAL_PORT}/api/v1/settings/api" >/dev/null 2>&1; then
      break
    fi
  fi
  [ "$attempt" -eq 10 ] && { echo "Warning: Port-forwards not working after 10 attempts — skipping."; exit 0; }
  echo "  Port-forward attempt $attempt failed, retrying..."
  sleep 5
done

FORGEJO_INTERNAL_URL="http://localhost:${FORGEJO_LOCAL_PORT}"
FORGEJO_API="${FORGEJO_INTERNAL_URL}/api/v1"
WP_INTERNAL_URL="http://localhost:${WP_LOCAL_PORT}"

# Woodpecker's WOODPECKER_HOST and WOODPECKER_FORGEJO_URL are for browser redirects.
# For API-only access via port-forward, we use localhost URLs directly.
FORGEJO_OAUTH_URL="${FORGEJO_INTERNAL_URL}"
WP_HOST="${WP_INTERNAL_URL}"
WP_URL="${WP_HOST}"

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
  if git ls-remote "http://${ADMIN_USER}:${ADMIN_PASS}@localhost:${FORGEJO_LOCAL_PORT}/system/open-platform.git" HEAD >/dev/null 2>&1; then
    echo "Forgejo git service is ready."
    break
  fi
  [ "$i" -eq 15 ] && { echo "Warning: Forgejo git not responding — pipelines may fail."; }
  sleep 2
done

# ── Phase 1: Woodpecker login via programmatic OAuth2 flow ────────────────────

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

# Rewrite Forgejo URL to use port-forward (Woodpecker may return internal or external URL)
AUTHORIZE_URL=$(echo "$AUTHORIZE_URL" | sed \
  "s|https://${PREFIX}forgejo\.${DOMAIN}|http://localhost:${FORGEJO_LOCAL_PORT}|;\
   s|http://${PREFIX}forgejo\.${DOMAIN}|http://localhost:${FORGEJO_LOCAL_PORT}|;\
   s|http://forgejo-http\.forgejo\.svc\.cluster\.local:3000|http://localhost:${FORGEJO_LOCAL_PORT}|")

# Step 3: Fetch Forgejo authorize — may show grant page (first time) or auto-redirect (already authorized)
AUTHORIZE_HEADERS=$(curl -sSk -b "${FORGEJO_COOKIES}" -c "${FORGEJO_COOKIES}" \
  -o "${COOKIE_DIR}/grant_body" -D - "${AUTHORIZE_URL}" 2>&1)

AUTHORIZE_STATUS=$(echo "$AUTHORIZE_HEADERS" | grep -E '^HTTP' | tail -1 | awk '{print $2}')

rewrite_callback() {
  # Rewrite external callback URL to use port-forward (avoids cookie domain mismatch)
  echo "$1" | sed "s|https://${PREFIX}ci\.${DOMAIN}|http://localhost:${WP_LOCAL_PORT}|;s|http://${PREFIX}ci\.${DOMAIN}|http://localhost:${WP_LOCAL_PORT}|"
}

if [ "$AUTHORIZE_STATUS" = "303" ] || [ "$AUTHORIZE_STATUS" = "302" ]; then
  # Already authorized — Forgejo redirected with auth code. Follow the callback.
  CALLBACK_URL=$(echo "$AUTHORIZE_HEADERS" | grep -i '^location:' | tr -d '\r' | awk '{print $2}')
  CALLBACK_URL=$(rewrite_callback "$CALLBACK_URL")
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

  # Submit grant form — capture redirect, don't follow automatically
  GRANT_RESPONSE=$(curl -sSk -b "${FORGEJO_COOKIES}" -c "${FORGEJO_COOKIES}" \
    --data-urlencode "client_id=${GRANT_CLIENT}" \
    --data-urlencode "state=${GRANT_STATE}" \
    --data-urlencode "scope=" \
    --data-urlencode "nonce=" \
    --data-urlencode "redirect_uri=${GRANT_REDIRECT}" \
    --data-urlencode "granted=true" \
    -o /dev/null -D - "${FORGEJO_OAUTH_URL}/login/oauth/grant")

  GRANT_CALLBACK=$(echo "$GRANT_RESPONSE" | grep -i '^location:' | tr -d '\r' | awk '{print $2}')
  GRANT_CALLBACK=$(rewrite_callback "$GRANT_CALLBACK")
  curl -sSk -b "${FORGEJO_COOKIES}" -c "${WP_COOKIES}" -L \
    -o /dev/null "${GRANT_CALLBACK}"
fi

# Step 4: Extract session and CSRF
WP_SESSION=$(grep user_sess "${WP_COOKIES}" 2>/dev/null | awk '{print $NF}' || echo "")
WP_CSRF=$(curl -sSk -b "user_sess=${WP_SESSION}" "http://localhost:${WP_LOCAL_PORT}/web-config.js" 2>/dev/null \
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

# Discover all repos across all orgs (except meta repos like open-platform, template, deploy-bundle)
SKIP_REPOS="system/open-platform system/template system/deploy-bundle"

# Get all orgs
ALL_ORGS=$(forgejo_api "${FORGEJO_API}/admin/orgs?limit=50" 2>/dev/null | jq -r '.[].username' 2>/dev/null || \
  forgejo_api "${FORGEJO_API}/orgs/system" 2>/dev/null | jq -r '.username' 2>/dev/null || echo "system")

REPO_LIST=""
for ORG_NAME in $ALL_ORGS; do
  ORG_REPOS=$(forgejo_api "${FORGEJO_API}/orgs/${ORG_NAME}/repos?limit=50" 2>/dev/null | \
    jq -r '.[].full_name' 2>/dev/null || true)
  if [ -n "$ORG_REPOS" ]; then
    REPO_LIST="${REPO_LIST}${REPO_LIST:+$'\n'}${ORG_REPOS}"
  fi
done

# Also include user repos (repos not in any org)
USER_REPOS=$(forgejo_api "${FORGEJO_API}/user/repos?limit=50" 2>/dev/null | \
  jq -r '.[] | select(.owner.type == "Organization" | not) | .full_name' 2>/dev/null || true)
if [ -n "$USER_REPOS" ]; then
  REPO_LIST="${REPO_LIST}${REPO_LIST:+$'\n'}${USER_REPOS}"
fi

# Deduplicate (org repos + user repos may overlap)
REPO_LIST=$(echo "$REPO_LIST" | sort -u)

# Filter out skip repos and template repos
FILTERED_LIST=""
for repo in $REPO_LIST; do
  skip=false
  for skip_repo in $SKIP_REPOS; do
    if [ "$repo" = "$skip_repo" ]; then
      skip=true
      break
    fi
  done
  # Also skip repos marked as template
  if [ "$skip" = "false" ]; then
    IS_TEMPLATE=$(forgejo_api "${FORGEJO_API}/repos/${repo}" 2>/dev/null | jq -r '.template // false' 2>/dev/null || echo "false")
    if [ "$IS_TEMPLATE" = "true" ]; then
      skip=true
    fi
  fi
  if [ "$skip" = "false" ]; then
    FILTERED_LIST="${FILTERED_LIST}${FILTERED_LIST:+$'\n'}${repo}"
  fi
done

if [ -z "$FILTERED_LIST" ]; then
  echo "No deployable repos found — skipping activation."
  REPOS=()
else
  REPOS=()
  while IFS= read -r line; do
    [ -n "$line" ] && REPOS+=("$line")
  done <<< "$FILTERED_LIST"
  echo "Found ${#REPOS[@]} deployable repos: ${REPOS[*]}"
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

# Create org-level secrets for ALL Woodpecker orgs
WP_ORGS=$(wp_api "${WP_URL}/api/orgs" 2>/dev/null | jq -r '.[].id' 2>/dev/null || echo "")
if [ -z "$WP_ORGS" ]; then
  echo "Warning: No Woodpecker orgs found — skipping secrets."
else
  for ORG_ID in $WP_ORGS; do
    ORG_NAME=$(wp_api "${WP_URL}/api/orgs" 2>/dev/null | jq -r ".[] | select(.id == ${ORG_ID}) | .name" 2>/dev/null || echo "org-${ORG_ID}")
    echo "Setting secrets for Woodpecker org '${ORG_NAME}' (id=${ORG_ID})..."

    for SECRET_NAME in registry_username registry_token platform_domain registry_host registry_push_host service_prefix provisioner_enabled; do
      EXISTING=$(wp_api "${WP_URL}/api/orgs/${ORG_ID}/secrets/${SECRET_NAME}" 2>/dev/null || echo "")
      if [ -n "$EXISTING" ] && echo "$EXISTING" | jq -e '.name' >/dev/null 2>&1; then
        continue
      fi

      case "$SECRET_NAME" in
        registry_username) VALUE="${ADMIN_USER}" ;;
        registry_token) VALUE="${ADMIN_PASS}" ;;
        platform_domain) VALUE="${DOMAIN}" ;;
        registry_host) VALUE="${PREFIX}forgejo.${DOMAIN}" ;;
        registry_push_host) VALUE="forgejo-http.forgejo.svc.cluster.local:3000" ;;
        service_prefix) VALUE="${PREFIX}" ;;
        provisioner_enabled) VALUE="${PROVISIONER_ENABLED:-false}" ;;
      esac

      # Woodpecker rejects empty values — use a space for empty secrets
      # (pipelines trim whitespace before use)
      if [ -z "$VALUE" ]; then
        VALUE=" "
      fi

      if wp_api -X POST "${WP_URL}/api/orgs/${ORG_ID}/secrets" \
        -H "Content-Type: application/json" \
        -d "{\"name\": \"${SECRET_NAME}\", \"value\": \"${VALUE}\", \"events\": [\"push\", \"pull_request\", \"manual\"]}" >/dev/null 2>&1; then
        echo "  Created '${SECRET_NAME}' for org '${ORG_NAME}'."
      else
        echo "  Warning: Failed to create '${SECRET_NAME}' for org '${ORG_NAME}' — skipping."
      fi
    done
  done
fi

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
      -d '{"state":"closed"}' >/dev/null 2>&1 || true
    sleep 1
    forgejo_api -X PATCH "${FORGEJO_API}/repos/system/social/pulls/${PR_NUMBER}" \
      -H "Content-Type: application/json" \
      -d '{"state":"open"}' >/dev/null 2>&1 || true
    echo "Social PR reopened — preview pipeline triggered."
  fi
fi

echo ""
echo "Woodpecker setup complete. Pipelines running in background."
