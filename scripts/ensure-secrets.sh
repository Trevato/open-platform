#!/usr/bin/env bash
set -euo pipefail

# Creates bootstrap K8s secrets from .env
# Idempotent — safe to run on every deploy

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$ROOT_DIR/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "Error: .env not found. Run: cp .env.example .env"
  exit 1
fi

# shellcheck source=/dev/null
source "$ENV_FILE"

# Validate required variables
MISSING=()
for VAR in FORGEJO_ADMIN_USER FORGEJO_ADMIN_PASSWORD FORGEJO_DB_PASSWORD MINIO_ROOT_USER MINIO_ROOT_PASSWORD WOODPECKER_AGENT_SECRET; do
  if [ -z "${!VAR:-}" ]; then
    MISSING+=("$VAR")
  fi
done
if [ ${#MISSING[@]} -gt 0 ]; then
  echo "Error: Missing required .env variables: ${MISSING[*]}"
  echo "Run: cp .env.example .env  — then fill in the values."
  exit 1
fi

apply_secret() {
  kubectl create secret generic "$@" --dry-run=client -o yaml | kubectl apply -f -
}

echo "Ensuring bootstrap secrets..."

apply_secret forgejo-admin-credentials -n forgejo \
  --from-literal=username="${FORGEJO_ADMIN_USER}" \
  --from-literal=password="${FORGEJO_ADMIN_PASSWORD}"

apply_secret forgejo-db-config -n forgejo \
  --from-literal=password="${FORGEJO_DB_PASSWORD}"

apply_secret forgejo-db-credentials -n postgres \
  --from-literal=username=forgejo \
  --from-literal=password="${FORGEJO_DB_PASSWORD}"

apply_secret minio-credentials -n minio \
  --from-literal=rootUser="${MINIO_ROOT_USER}" \
  --from-literal=rootPassword="${MINIO_ROOT_PASSWORD}"

# Woodpecker secret: preserve OAuth2 fields if they exist from a previous deploy
if kubectl get secret woodpecker-secrets -n woodpecker >/dev/null 2>&1; then
  EXISTING_CLIENT=$(kubectl get secret woodpecker-secrets -n woodpecker -o jsonpath='{.data.WOODPECKER_FORGEJO_CLIENT}' 2>/dev/null || true)
  EXISTING_SECRET=$(kubectl get secret woodpecker-secrets -n woodpecker -o jsonpath='{.data.WOODPECKER_FORGEJO_SECRET}' 2>/dev/null || true)
  if [ -n "$EXISTING_CLIENT" ] && [ -n "$EXISTING_SECRET" ]; then
    apply_secret woodpecker-secrets -n woodpecker \
      --from-literal=WOODPECKER_AGENT_SECRET="${WOODPECKER_AGENT_SECRET}" \
      --from-literal=WOODPECKER_FORGEJO_CLIENT="$(echo "$EXISTING_CLIENT" | base64 -d)" \
      --from-literal=WOODPECKER_FORGEJO_SECRET="$(echo "$EXISTING_SECRET" | base64 -d)"
  else
    apply_secret woodpecker-secrets -n woodpecker \
      --from-literal=WOODPECKER_AGENT_SECRET="${WOODPECKER_AGENT_SECRET}"
  fi
else
  apply_secret woodpecker-secrets -n woodpecker \
    --from-literal=WOODPECKER_AGENT_SECRET="${WOODPECKER_AGENT_SECRET}"
fi

# OAuth2-Proxy secret: preserve client creds if they exist from a previous deploy
OAUTH2_PROXY_COOKIE_SECRET="${OAUTH2_PROXY_COOKIE_SECRET:-$(openssl rand -base64 32 | head -c 32)}"
if kubectl get secret oauth2-proxy-secrets -n oauth2-proxy >/dev/null 2>&1; then
  EXISTING_CLIENT_ID=$(kubectl get secret oauth2-proxy-secrets -n oauth2-proxy -o jsonpath='{.data.client-id}' 2>/dev/null || true)
  EXISTING_CLIENT_SECRET=$(kubectl get secret oauth2-proxy-secrets -n oauth2-proxy -o jsonpath='{.data.client-secret}' 2>/dev/null || true)
  EXISTING_COOKIE=$(kubectl get secret oauth2-proxy-secrets -n oauth2-proxy -o jsonpath='{.data.cookie-secret}' 2>/dev/null || true)
  if [ -n "$EXISTING_CLIENT_ID" ] && [ -n "$EXISTING_CLIENT_SECRET" ]; then
    # Preserve existing cookie-secret if available
    COOKIE_VAL="${EXISTING_COOKIE:+$(echo "$EXISTING_COOKIE" | base64 -d)}"
    COOKIE_VAL="${COOKIE_VAL:-$OAUTH2_PROXY_COOKIE_SECRET}"
    apply_secret oauth2-proxy-secrets -n oauth2-proxy \
      --from-literal=cookie-secret="${COOKIE_VAL}" \
      --from-literal=client-id="$(echo "$EXISTING_CLIENT_ID" | base64 -d)" \
      --from-literal=client-secret="$(echo "$EXISTING_CLIENT_SECRET" | base64 -d)"
  else
    apply_secret oauth2-proxy-secrets -n oauth2-proxy \
      --from-literal=cookie-secret="${OAUTH2_PROXY_COOKIE_SECRET}"
  fi
else
  apply_secret oauth2-proxy-secrets -n oauth2-proxy \
    --from-literal=cookie-secret="${OAUTH2_PROXY_COOKIE_SECRET}"
fi

# Cloudflare tunnel credentials (for *.product-garden.com public access)
if [ -n "${CLOUDFLARE_TUNNEL_SECRET:-}" ] && [ -n "${CLOUDFLARE_TUNNEL_ID:-}" ] && [ -n "${CLOUDFLARE_ACCOUNT_TAG:-}" ]; then
  kubectl create secret generic cloudflared-credentials -n cloudflare \
    --from-literal=credentials.json="{\"AccountTag\":\"${CLOUDFLARE_ACCOUNT_TAG}\",\"TunnelID\":\"${CLOUDFLARE_TUNNEL_ID}\",\"TunnelSecret\":\"${CLOUDFLARE_TUNNEL_SECRET}\"}" \
    --dry-run=client -o yaml | kubectl apply -f -
  echo "Cloudflare tunnel credentials ready."
else
  echo "Skipping Cloudflare tunnel credentials (not configured in .env)."
fi

# Platform CA configmap — apps mount this for TLS to Forgejo
CA_CERT="$ROOT_DIR/certs/ca.crt"
if [ -f "$CA_CERT" ]; then
  kubectl create configmap platform-ca -n kube-system \
    --from-file=ca.crt="$CA_CERT" \
    --dry-run=client -o yaml | kubectl apply -f -
fi

echo "Bootstrap secrets ready."
