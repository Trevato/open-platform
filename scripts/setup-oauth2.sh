#!/usr/bin/env bash
set -euo pipefail

# Creates OAuth2 applications in Forgejo and stores credentials as K8s secrets.
# Idempotent — skips apps that already exist, uses kubectl apply for secrets.
# Runs as a forgejo postsync hook after the pod is ready.

DOMAIN="${PLATFORM_DOMAIN:?PLATFORM_DOMAIN not set — run generate-config.sh first}"
PREFIX="${SERVICE_PREFIX:-}"
FORGEJO_URL="https://${PREFIX}forgejo.${DOMAIN}"

OAUTH2_APPS=(
  "Headlamp|https://${PREFIX}headlamp.${DOMAIN}/oidc-callback|true"
  "Woodpecker|https://${PREFIX}ci.${DOMAIN}/authorize|true"
  "OAuth2-Proxy|https://${PREFIX}oauth2.${DOMAIN}/oauth2/callback|true"
  "Social|https://${PREFIX}social.${DOMAIN}/api/auth/oauth2/callback/forgejo|false"
  "Minecraft|https://${PREFIX}minecraft.${DOMAIN}/api/auth/oauth2/callback/forgejo|false"
  "Arcade|https://${PREFIX}arcade.${DOMAIN}/api/auth/oauth2/callback/forgejo|false"
  "Events|https://${PREFIX}events.${DOMAIN}/api/auth/oauth2/callback/forgejo|false"
  "Hub|https://${PREFIX}hub.${DOMAIN}/api/auth/oauth2/callback/forgejo|false"
  "Console|https://${PREFIX}console.${DOMAIN}/api/auth/oauth2/callback/forgejo|false"
)

# ── Wait for Forgejo ──────────────────────────────────────────────────────────

echo "Waiting for Forgejo pod..."
kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=forgejo -n forgejo --timeout=180s

ADMIN_USER=$(kubectl get secret forgejo-admin-credentials -n forgejo -o jsonpath='{.data.username}' | base64 -d)
ADMIN_PASS=$(kubectl get secret forgejo-admin-credentials -n forgejo -o jsonpath='{.data.password}' | base64 -d)

# Use port-forward for Forgejo API access (works without DNS/ingress)
FORGEJO_LOCAL_PORT=3333
kubectl port-forward -n forgejo svc/forgejo-http ${FORGEJO_LOCAL_PORT}:3000 &
PF_PID=$!
trap "kill $PF_PID 2>/dev/null || true" EXIT

API_URL="http://localhost:${FORGEJO_LOCAL_PORT}/api/v1"

echo "Waiting for Forgejo API (via port-forward)..."
for i in $(seq 1 30); do
  if curl -fsSk -u "${ADMIN_USER}:${ADMIN_PASS}" "${API_URL}/user" >/dev/null 2>&1; then
    echo "Forgejo API is ready."
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "Error: Forgejo API not responding after 30 attempts."
    exit 1
  fi
  sleep 2
done

# ── Fetch existing apps ───────────────────────────────────────────────────────

EXISTING_APPS=$(curl -fsSk -u "${ADMIN_USER}:${ADMIN_PASS}" "${API_URL}/user/applications/oauth2")

# ── Create or retrieve each app ───────────────────────────────────────────────

declare -A CLIENT_IDS
declare -A CLIENT_SECRETS

for entry in "${OAUTH2_APPS[@]}"; do
  APP_NAME="${entry%%|*}"
  REMAINDER="${entry#*|}"
  REDIRECT_URIS_CSV="${REMAINDER%%|*}"
  CONFIDENTIAL="${REMAINDER##*|}"

  # Build JSON array from comma-separated redirect URIs
  REDIRECT_URIS_JSON=$(echo "$REDIRECT_URIS_CSV" | tr ',' '\n' | jq -R . | jq -s .)

  EXISTING=$(echo "$EXISTING_APPS" | jq -r --arg name "$APP_NAME" '.[] | select(.name == $name)')

  if [ -n "$EXISTING" ]; then
    CLIENT_IDS["$APP_NAME"]=$(echo "$EXISTING" | jq -r '.client_id')
    APP_ID=$(echo "$EXISTING" | jq -r '.id')

    # Check if redirect URIs need updating (sorted comparison)
    CURRENT_URIS=$(echo "$EXISTING" | jq -r '.redirect_uris // [] | sort')
    DESIRED_URIS=$(echo "$REDIRECT_URIS_JSON" | jq -r 'sort')

    if [ "$CURRENT_URIS" = "$DESIRED_URIS" ]; then
      echo "OAuth2 app '${APP_NAME}' already exists with correct redirect URIs — skipping."
    else
      echo "OAuth2 app '${APP_NAME}' exists — updating redirect URIs."
      echo "  Current: ${CURRENT_URIS}"
      echo "  Desired: ${DESIRED_URIS}"
      # WARNING: PATCH regenerates client_secret. Capture it to update K8s secrets.
      PATCH_RESPONSE=$(curl -fsSk -u "${ADMIN_USER}:${ADMIN_PASS}" \
        -X PATCH "${API_URL}/user/applications/oauth2/${APP_ID}" \
        -H "Content-Type: application/json" \
        -d "{\"name\": \"${APP_NAME}\", \"redirect_uris\": ${REDIRECT_URIS_JSON}, \"confidential_client\": ${CONFIDENTIAL}}")
      CLIENT_SECRETS["$APP_NAME"]=$(echo "$PATCH_RESPONSE" | jq -r '.client_secret')
      echo "  Updated '${APP_NAME}' — new client_secret captured."
    fi

    # If no new secret from PATCH, check K8s secret existence later
    if [ -z "${CLIENT_SECRETS[$APP_NAME]+x}" ]; then
      CLIENT_SECRETS["$APP_NAME"]=""
    fi
  else
    echo "Creating OAuth2 app '${APP_NAME}'..."
    RESPONSE=$(curl -fsSk -u "${ADMIN_USER}:${ADMIN_PASS}" \
      -X POST "${API_URL}/user/applications/oauth2" \
      -H "Content-Type: application/json" \
      -d "{\"name\": \"${APP_NAME}\", \"redirect_uris\": ${REDIRECT_URIS_JSON}, \"confidential_client\": ${CONFIDENTIAL}}")

    CLIENT_IDS["$APP_NAME"]=$(echo "$RESPONSE" | jq -r '.client_id')
    CLIENT_SECRETS["$APP_NAME"]=$(echo "$RESPONSE" | jq -r '.client_secret')
    echo "Created '${APP_NAME}' (client_id: ${CLIENT_IDS[$APP_NAME]})"
  fi
done

# ── Create K8s secrets ────────────────────────────────────────────────────────

apply_secret() {
  kubectl create secret generic "$@" --dry-run=client -o yaml | kubectl apply -f -
}

# Headlamp OIDC secret — only update if we have a new secret (first creation)
if [ -n "${CLIENT_SECRETS[Headlamp]}" ]; then
  echo "Creating Headlamp OIDC secret..."
  apply_secret oidc -n headlamp \
    --from-literal=OIDC_CLIENT_ID="${CLIENT_IDS[Headlamp]}" \
    --from-literal=OIDC_CLIENT_SECRET="${CLIENT_SECRETS[Headlamp]}" \
    --from-literal=OIDC_ISSUER_URL="${FORGEJO_URL}" \
    --from-literal=OIDC_SCOPES="openid,profile,email,groups" \
    --from-literal=OIDC_CALLBACK_URL="https://${PREFIX}headlamp.${DOMAIN}/oidc-callback"
else
  # Verify the secret exists (from a previous run)
  if ! kubectl get secret oidc -n headlamp -o jsonpath='{.data.OIDC_CLIENT_ID}' 2>/dev/null | base64 -d >/dev/null 2>&1; then
    echo "Warning: Headlamp OAuth2 app exists but 'oidc' secret is missing."
    echo "Delete the app in Forgejo and re-run, or create the secret manually."
    exit 1
  fi
  echo "Headlamp OIDC secret already exists."
fi

# Woodpecker secret — merge OAuth2 creds into existing agent secret
if [ -n "${CLIENT_SECRETS[Woodpecker]}" ]; then
  echo "Updating Woodpecker secrets with OAuth2 credentials..."
  AGENT_SECRET=$(kubectl get secret woodpecker-secrets -n woodpecker -o jsonpath='{.data.WOODPECKER_AGENT_SECRET}' | base64 -d)

  apply_secret woodpecker-secrets -n woodpecker \
    --from-literal=WOODPECKER_AGENT_SECRET="${AGENT_SECRET}" \
    --from-literal=WOODPECKER_FORGEJO_CLIENT="${CLIENT_IDS[Woodpecker]}" \
    --from-literal=WOODPECKER_FORGEJO_SECRET="${CLIENT_SECRETS[Woodpecker]}"
else
  if ! kubectl get secret woodpecker-secrets -n woodpecker -o jsonpath='{.data.WOODPECKER_FORGEJO_CLIENT}' 2>/dev/null | base64 -d >/dev/null 2>&1; then
    echo "Warning: Woodpecker OAuth2 app exists but secret is missing OAuth2 credentials."
    echo "Delete the app in Forgejo and re-run, or update the secret manually."
    exit 1
  fi
  echo "Woodpecker OAuth2 credentials already in secret."
fi

# OAuth2-Proxy secret — merge client creds into existing cookie-secret
if [ -n "${CLIENT_SECRETS[OAuth2-Proxy]}" ]; then
  echo "Creating OAuth2-Proxy secret..."
  # Preserve existing cookie-secret from bootstrap
  COOKIE_SECRET=$(kubectl get secret oauth2-proxy-secrets -n oauth2-proxy -o jsonpath='{.data.cookie-secret}' 2>/dev/null | base64 -d || openssl rand -base64 32 | head -c 32)

  apply_secret oauth2-proxy-secrets -n oauth2-proxy \
    --from-literal=client-id="${CLIENT_IDS[OAuth2-Proxy]}" \
    --from-literal=client-secret="${CLIENT_SECRETS[OAuth2-Proxy]}" \
    --from-literal=cookie-secret="${COOKIE_SECRET}"
else
  if ! kubectl get secret oauth2-proxy-secrets -n oauth2-proxy -o jsonpath='{.data.client-id}' 2>/dev/null | base64 -d >/dev/null 2>&1; then
    echo "Warning: OAuth2-Proxy app exists but secret is missing client credentials."
    echo "Delete the app in Forgejo and re-run, or update the secret manually."
    exit 1
  fi
  echo "OAuth2-Proxy credentials already in secret."
fi

# ── App auth secrets (Social, Minecraft, Arcade, Events) ─────────────────────
# These include BETTER_AUTH_SECRET for session encryption.
# On PATCH (redirect URI update), client_secret changes but we MUST preserve
# the existing BETTER_AUTH_SECRET to avoid invalidating active sessions.

create_app_auth_secret() {
  local APP_NAME="$1"
  local SECRET_NAME="$2"
  local NAMESPACE="$3"

  if [ -n "${CLIENT_SECRETS[$APP_NAME]}" ]; then
    # Preserve existing BETTER_AUTH_SECRET if the secret already exists
    EXISTING_AUTH_SECRET=""
    if kubectl get secret "${SECRET_NAME}" -n "${NAMESPACE}" >/dev/null 2>&1; then
      EXISTING_AUTH_SECRET=$(kubectl get secret "${SECRET_NAME}" -n "${NAMESPACE}" -o jsonpath='{.data.secret}' 2>/dev/null | base64 -d || true)
    fi
    AUTH_SECRET="${EXISTING_AUTH_SECRET:-$(openssl rand -base64 32 | head -c 32)}"

    echo "Creating ${APP_NAME} auth secret..."
    apply_secret "${SECRET_NAME}" -n "${NAMESPACE}" \
      --from-literal=client-id="${CLIENT_IDS[$APP_NAME]}" \
      --from-literal=client-secret="${CLIENT_SECRETS[$APP_NAME]}" \
      --from-literal=secret="${AUTH_SECRET}"
  else
    if ! kubectl get secret "${SECRET_NAME}" -n "${NAMESPACE}" -o jsonpath='{.data.client-id}' 2>/dev/null | base64 -d >/dev/null 2>&1; then
      echo "Warning: ${APP_NAME} OAuth2 app exists but '${SECRET_NAME}' secret is missing."
      echo "Delete the app in Forgejo and re-run, or create the secret manually."
      exit 1
    fi
    echo "${APP_NAME} auth secret already exists."
  fi
}

create_app_auth_secret "Social" "social-auth" "op-system-social"
create_app_auth_secret "Minecraft" "minecraft-auth" "op-system-minecraft"
create_app_auth_secret "Arcade" "arcade-auth" "op-system-arcade"
create_app_auth_secret "Events" "events-auth" "op-system-events"
create_app_auth_secret "Hub" "hub-auth" "op-system-hub"
create_app_auth_secret "Console" "console-auth" "op-system-console"

echo "OAuth2 setup complete."
