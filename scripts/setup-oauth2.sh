#!/usr/bin/env bash
set -euo pipefail

# Creates OAuth2 applications in Forgejo and stores credentials as K8s secrets.
# Idempotent — skips apps that already exist, uses kubectl apply for secrets.
# Runs as a forgejo postsync hook after the pod is ready.

FORGEJO_URL="https://forgejo.dev.test"
API_URL="${FORGEJO_URL}/api/v1"

OAUTH2_APPS=(
  "Headlamp|https://headlamp.dev.test/oidc-callback"
  "Woodpecker|http://ci.dev.test/authorize"
)

# ── Wait for Forgejo ──────────────────────────────────────────────────────────

echo "Waiting for Forgejo pod..."
kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=forgejo -n forgejo --timeout=180s

echo "Waiting for Forgejo API..."
ADMIN_USER=$(kubectl get secret forgejo-admin-credentials -n forgejo -o jsonpath='{.data.username}' | base64 -d)
ADMIN_PASS=$(kubectl get secret forgejo-admin-credentials -n forgejo -o jsonpath='{.data.password}' | base64 -d)

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
  REDIRECT_URI="${entry##*|}"

  EXISTING=$(echo "$EXISTING_APPS" | jq -r --arg name "$APP_NAME" '.[] | select(.name == $name)')

  if [ -n "$EXISTING" ]; then
    echo "OAuth2 app '${APP_NAME}' already exists — skipping creation."
    CLIENT_IDS["$APP_NAME"]=$(echo "$EXISTING" | jq -r '.client_id')
    # Existing apps don't return the secret — check if K8s secret already has it
    CLIENT_SECRETS["$APP_NAME"]=""
  else
    echo "Creating OAuth2 app '${APP_NAME}'..."
    RESPONSE=$(curl -fsSk -u "${ADMIN_USER}:${ADMIN_PASS}" \
      -X POST "${API_URL}/user/applications/oauth2" \
      -H "Content-Type: application/json" \
      -d "{\"name\": \"${APP_NAME}\", \"redirect_uris\": [\"${REDIRECT_URI}\"], \"confidential_client\": true}")

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
    --from-literal=OIDC_CALLBACK_URL="https://headlamp.dev.test/oidc-callback"
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

echo "OAuth2 setup complete."
