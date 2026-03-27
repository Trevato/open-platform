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

# Forgejo MinIO credentials (for package storage)
apply_secret forgejo-minio-config -n forgejo \
  --from-literal=accessKey="${MINIO_ROOT_USER}" \
  --from-literal=secretKey="${MINIO_ROOT_PASSWORD}"

# External SMTP credentials (optional — only when external SMTP configured)
if [ -n "${SMTP_USERNAME:-}" ] && [ -n "${SMTP_PASSWORD:-}" ]; then
  apply_secret forgejo-smtp-config -n forgejo \
    --from-literal=username="${SMTP_USERNAME}" \
    --from-literal=password="${SMTP_PASSWORD}"
  echo "External SMTP credentials ready."
fi

# Jitsi JWT secret (conditional)
if [ -n "${JITSI_JWT_SECRET:-}" ]; then
  apply_secret jitsi-secrets -n jitsi \
    --from-literal=JWT_APP_SECRET="${JITSI_JWT_SECRET}"
  echo "Jitsi JWT secret ready."
fi

# Zulip database credentials (conditional)
if [ -n "${ZULIP_DB_PASSWORD:-}" ]; then
  apply_secret zulip-db-credentials -n postgres \
    --from-literal=username=zulip \
    --from-literal=password="${ZULIP_DB_PASSWORD}"
  apply_secret zulip-db-credentials -n zulip \
    --from-literal=username=zulip \
    --from-literal=password="${ZULIP_DB_PASSWORD}"
  echo "Zulip DB credentials ready."
fi

# Zulip secrets (conditional)
if [ -n "${ZULIP_SECRET_KEY:-}" ]; then
  # Preserve existing OIDC creds if they exist (from setup-oauth2.sh)
  ZULIP_ARGS=(zulip-secrets -n zulip
    --from-literal=rabbitmq-password="${ZULIP_RABBITMQ_PASSWORD}"
    --from-literal=secret-key="${ZULIP_SECRET_KEY}"
  )
  if kubectl get secret zulip-secrets -n zulip >/dev/null 2>&1; then
    EXISTING_OIDC_ID=$(kubectl get secret zulip-secrets -n zulip -o jsonpath='{.data.oidc-client-id}' 2>/dev/null | base64 -d || true)
    EXISTING_OIDC_SECRET=$(kubectl get secret zulip-secrets -n zulip -o jsonpath='{.data.oidc-client-secret}' 2>/dev/null | base64 -d || true)
    if [ -n "$EXISTING_OIDC_ID" ]; then
      ZULIP_ARGS+=(--from-literal=oidc-client-id="${EXISTING_OIDC_ID}")
      ZULIP_ARGS+=(--from-literal=oidc-client-secret="${EXISTING_OIDC_SECRET}")
    fi
  fi
  apply_secret "${ZULIP_ARGS[@]}"
  echo "Zulip secrets ready."
fi

# Cloudflare tunnel credentials (optional, for public access via Cloudflare)
if [ -n "${CLOUDFLARE_TUNNEL_SECRET:-}" ] && [ -n "${CLOUDFLARE_TUNNEL_ID:-}" ] && [ -n "${CLOUDFLARE_ACCOUNT_TAG:-}" ]; then
  kubectl create secret generic cloudflared-credentials -n cloudflare \
    --from-literal=credentials.json="{\"AccountTag\":\"${CLOUDFLARE_ACCOUNT_TAG}\",\"TunnelID\":\"${CLOUDFLARE_TUNNEL_ID}\",\"TunnelSecret\":\"${CLOUDFLARE_TUNNEL_SECRET}\"}" \
    --dry-run=client -o yaml | kubectl apply -f -
  echo "Cloudflare tunnel credentials ready."
else
  echo "Skipping Cloudflare tunnel credentials (not configured in .env)."
fi

# Provisioner secrets (conditional — only if provisioner namespace exists)
if kubectl get ns provisioner &>/dev/null; then
  echo "Creating provisioner secrets..."

  # provisioner-db: console database credentials for reading instances table
  apply_secret provisioner-db -n provisioner \
    --from-literal=host="postgres-rw.postgres.svc.cluster.local" \
    --from-literal=port="5432" \
    --from-literal=username="op_system_console" \
    --from-literal=password="op_system_console" \
    --from-literal=database="op_system_console"

  # provisioner-forgejo: admin credentials for cloning repos into vCluster
  apply_secret provisioner-forgejo -n provisioner \
    --from-literal=username="${FORGEJO_ADMIN_USER}" \
    --from-literal=password="${FORGEJO_ADMIN_PASSWORD}"
else
  echo "Skipping provisioner secrets (namespace not found)."
fi

# Platform CA configmap — apps mount this for TLS to Forgejo
CA_CERT="$ROOT_DIR/certs/ca.crt"
if [ -f "$CA_CERT" ]; then
  for ns in kube-system headlamp jitsi; do
    if kubectl get ns "$ns" &>/dev/null; then
      kubectl create configmap platform-ca -n "$ns" \
        --from-file=ca.crt="$CA_CERT" \
        --dry-run=client -o yaml | kubectl apply -f -
    fi
  done
fi

echo "Bootstrap secrets ready."
