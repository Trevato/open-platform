#!/usr/bin/env bash
set -euo pipefail

# Generates all config files from open-platform.yaml + templates.
# Idempotent — secrets are persisted in open-platform.state.yaml.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
CONFIG_FILE="$ROOT_DIR/open-platform.yaml"
STATE_FILE="$ROOT_DIR/open-platform.state.yaml"
TEMPLATES_DIR="$ROOT_DIR/config/templates"

# ── YAML Parser ─────────────────────────────────────────────────────────────
# Simple key-value extraction for flat/nested YAML (no arrays, no anchors).
# Handles: "key: value" and "parent:\n  child: value" → parent.child=value

yaml_get() {
  local file="$1" key="$2"
  local IFS='.'
  # shellcheck disable=SC2086
  set -- $key
  local depth=0 target_depth=$(($# - 1)) current_key=""
  local indent_stack=(-1) key_stack=()

  while IFS= read -r line || [[ -n "$line" ]]; do
    # Skip comments and blanks
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" =~ ^[[:space:]]*$ ]] && continue

    # Measure indent
    local stripped="${line#"${line%%[![:space:]]*}"}"
    local indent=$(( ${#line} - ${#stripped} ))

    # Pop stack to find parent level
    while (( ${#indent_stack[@]} > 1 )) && (( indent <= ${indent_stack[${#indent_stack[@]}-1]} )); do
      unset 'indent_stack[${#indent_stack[@]}-1]'
      unset 'key_stack[${#key_stack[@]}-1]'
    done

    # Parse key: value
    if [[ "$stripped" =~ ^([a-zA-Z_][a-zA-Z0-9_-]*):(.*)$ ]]; then
      local k="${BASH_REMATCH[1]}"
      local v="${BASH_REMATCH[2]}"
      v="${v#"${v%%[![:space:]]*}"}"  # ltrim
      v="${v%"${v##*[![:space:]]}"}"  # rtrim
      # Remove surrounding quotes
      if [[ "$v" =~ ^\"(.*)\"$ ]] || [[ "$v" =~ ^\'(.*)\'$ ]]; then
        v="${BASH_REMATCH[1]}"
      fi

      if [[ -z "$v" ]]; then
        # It's a parent key — push to stack
        indent_stack+=("$indent")
        key_stack+=("$k")
      else
        # Build full path
        local full_path=""
        for pk in "${key_stack[@]}"; do
          full_path="${full_path}${full_path:+.}${pk}"
        done
        full_path="${full_path}${full_path:+.}${k}"

        if [[ "$full_path" == "$key" ]]; then
          echo "$v"
          return 0
        fi
      fi
    fi
  done < "$file"
  return 1
}

yaml_set() {
  local file="$1" key="$2" value="$3"
  if [ -f "$file" ] && grep -q "^${key}:" "$file" 2>/dev/null; then
    if sed --version >/dev/null 2>&1; then
      sed -i "s|^${key}:.*|${key}: ${value}|" "$file"  # GNU sed
    else
      sed -i '' "s|^${key}:.*|${key}: ${value}|" "$file"  # macOS sed
    fi
  else
    echo "${key}: ${value}" >> "$file"
  fi
}

# Cross-platform sed in-place
sed_i() {
  if sed --version >/dev/null 2>&1; then
    sed -i "$@"  # GNU sed
  else
    sed -i '' "$@"  # macOS sed
  fi
}

# ── Validate Config ─────────────────────────────────────────────────────────

if [ ! -f "$CONFIG_FILE" ]; then
  echo "Error: open-platform.yaml not found."
  echo "Run: cp open-platform.yaml.example open-platform.yaml"
  exit 1
fi

DOMAIN=$(yaml_get "$CONFIG_FILE" "domain") || { echo "Error: 'domain' not set in open-platform.yaml"; exit 1; }
ADMIN_USER=$(yaml_get "$CONFIG_FILE" "admin.username" 2>/dev/null) || ADMIN_USER="opadmin"
ADMIN_EMAIL=$(yaml_get "$CONFIG_FILE" "admin.email" 2>/dev/null) || ADMIN_EMAIL="admin@${DOMAIN}"
DOMAIN_TLD="${DOMAIN##*.}"

# Forgejo reserves certain usernames
RESERVED_NAMES="admin api assets attachments avatars captcha commits debug error explore favicon ghost issues labels login lfs milestones notifications org raw repo search stars template topics user"
for reserved in $RESERVED_NAMES; do
  if [ "$ADMIN_USER" = "$reserved" ]; then
    echo "Error: '$ADMIN_USER' is a reserved name in Forgejo. Choose a different admin.username."
    exit 1
  fi
done
TLS_MODE=$(yaml_get "$CONFIG_FILE" "tls.mode" 2>/dev/null) || TLS_MODE="selfsigned"
TLS_EMAIL=$(yaml_get "$CONFIG_FILE" "tls.email" 2>/dev/null) || TLS_EMAIL="$ADMIN_EMAIL"
SERVICE_PREFIX=$(yaml_get "$CONFIG_FILE" "service_prefix" 2>/dev/null) || SERVICE_PREFIX=""

# Cloudflare settings (optional)
CF_ACCOUNT_TAG=$(yaml_get "$CONFIG_FILE" "cloudflare.account_tag" 2>/dev/null) || CF_ACCOUNT_TAG=""
CF_TUNNEL_ID=$(yaml_get "$CONFIG_FILE" "cloudflare.tunnel_id" 2>/dev/null) || CF_TUNNEL_ID=""
CF_TUNNEL_SECRET=$(yaml_get "$CONFIG_FILE" "cloudflare.tunnel_secret" 2>/dev/null) || CF_TUNNEL_SECRET=""

# SMTP settings (optional — defaults to bundled Mailpit)
SMTP_EXTERNAL_HOST=$(yaml_get "$CONFIG_FILE" "smtp.host" 2>/dev/null) || SMTP_EXTERNAL_HOST=""
SMTP_EXTERNAL_PORT=$(yaml_get "$CONFIG_FILE" "smtp.port" 2>/dev/null) || SMTP_EXTERNAL_PORT=""
SMTP_EXTERNAL_USER=$(yaml_get "$CONFIG_FILE" "smtp.username" 2>/dev/null) || SMTP_EXTERNAL_USER=""
SMTP_EXTERNAL_PASS=$(yaml_get "$CONFIG_FILE" "smtp.password" 2>/dev/null) || SMTP_EXTERNAL_PASS=""
SMTP_EXTERNAL_FROM=$(yaml_get "$CONFIG_FILE" "smtp.from" 2>/dev/null) || SMTP_EXTERNAL_FROM=""

# Jitsi settings (optional)
JITSI_ENABLED=$(yaml_get "$CONFIG_FILE" "jitsi.enabled" 2>/dev/null) || JITSI_ENABLED="true"
JITSI_ALLOW_GUESTS=$(yaml_get "$CONFIG_FILE" "jitsi.allow_guests" 2>/dev/null) || JITSI_ALLOW_GUESTS="true"
JITSI_JVB_ADVERTISE_IP=$(yaml_get "$CONFIG_FILE" "jitsi.jvb_advertise_ip" 2>/dev/null) || JITSI_JVB_ADVERTISE_IP=""

# Zulip settings (optional)
ZULIP_ENABLED=$(yaml_get "$CONFIG_FILE" "zulip.enabled" 2>/dev/null) || ZULIP_ENABLED="true"

# pgAdmin settings (optional)
PGADMIN_ENABLED=$(yaml_get "$CONFIG_FILE" "pgadmin.enabled" 2>/dev/null) || PGADMIN_ENABLED="false"

# Provisioner (optional)
PROVISIONER_ENABLED=$(yaml_get "$CONFIG_FILE" "provisioner.enabled" 2>/dev/null) || PROVISIONER_ENABLED="false"

# Infrastructure mode (optional — defaults to bundled)
INFRA_MODE=$(yaml_get "$CONFIG_FILE" "infrastructure.mode" 2>/dev/null) || INFRA_MODE="bundled"

# Network mode (optional — defaults to host)
NETWORK_MODE=$(yaml_get "$CONFIG_FILE" "network.mode" 2>/dev/null) || NETWORK_MODE="host"
METALLB_TRAEFIK_IP=$(yaml_get "$CONFIG_FILE" "network.traefik_ip" 2>/dev/null) || METALLB_TRAEFIK_IP=""
METALLB_ADDRESS_POOL=$(yaml_get "$CONFIG_FILE" "network.address_pool" 2>/dev/null) || METALLB_ADDRESS_POOL=""
METALLB_INTERFACE=$(yaml_get "$CONFIG_FILE" "network.interface" 2>/dev/null) || METALLB_INTERFACE=""

# Multinode (optional)
MULTINODE="false"
# Check if nodes section exists in config
if yaml_get "$CONFIG_FILE" "nodes.server.role" 2>/dev/null || \
   yaml_get "$CONFIG_FILE" "nodes.agents" 2>/dev/null || \
   yaml_get "$CONFIG_FILE" "nodes.servers" 2>/dev/null; then
  MULTINODE="true"
fi

# Validate loadbalancer mode requirements
if [ "$NETWORK_MODE" = "loadbalancer" ]; then
  [ -z "$METALLB_TRAEFIK_IP" ] && { echo "Error: network.traefik_ip required for loadbalancer mode"; exit 1; }
  [ -z "$METALLB_ADDRESS_POOL" ] && { echo "Error: network.address_pool required for loadbalancer mode"; exit 1; }
  [ -z "$METALLB_INTERFACE" ] && { echo "Error: network.interface required for loadbalancer mode"; exit 1; }
fi

echo "Generating config for: ${DOMAIN}"
echo "  Admin: ${ADMIN_USER} <${ADMIN_EMAIL}>"
echo "  TLS:   ${TLS_MODE}"
if [ -n "$SERVICE_PREFIX" ]; then
  echo "  Prefix: ${SERVICE_PREFIX}"
fi
if [ -n "$SMTP_EXTERNAL_HOST" ]; then
  echo "  SMTP: external (${SMTP_EXTERNAL_HOST})"
else
  echo "  SMTP: bundled Mailpit"
fi
if [ "$JITSI_ENABLED" = "true" ]; then
  echo "  Jitsi: enabled"
fi
if [ "$ZULIP_ENABLED" = "true" ]; then
  echo "  Zulip: enabled"
fi
if [ "$PGADMIN_ENABLED" = "true" ]; then
  echo "  pgAdmin: enabled"
fi
if [ "$PROVISIONER_ENABLED" = "true" ]; then
  echo "  Provisioner: enabled"
fi
echo "  Network: ${NETWORK_MODE}"
echo "  Infrastructure: ${INFRA_MODE}"
if [ "$MULTINODE" = "true" ]; then
  echo "  Multinode: enabled"
fi

# ── Generate / Load Secrets ─────────────────────────────────────────────────

generate_secret() { openssl rand -hex 32; }

# Initialize optional service secrets (populated from state or generated below)
JITSI_JWT_SECRET=""
ZULIP_SECRET_KEY=""
ZULIP_RABBITMQ_PASSWORD=""
ZULIP_DB_PASSWORD=""

if [ -f "$STATE_FILE" ]; then
  echo "  State: loading from open-platform.state.yaml"
  FORGEJO_ADMIN_PASSWORD=$(yaml_get "$STATE_FILE" "forgejo_admin_password") || FORGEJO_ADMIN_PASSWORD=""
  FORGEJO_DB_PASSWORD=$(yaml_get "$STATE_FILE" "forgejo_db_password") || FORGEJO_DB_PASSWORD=""
  MINIO_ROOT_PASSWORD=$(yaml_get "$STATE_FILE" "minio_root_password") || MINIO_ROOT_PASSWORD=""
  WOODPECKER_AGENT_SECRET=$(yaml_get "$STATE_FILE" "woodpecker_agent_secret") || WOODPECKER_AGENT_SECRET=""
  OAUTH2_PROXY_COOKIE_SECRET=$(yaml_get "$STATE_FILE" "oauth2_proxy_cookie_secret") || OAUTH2_PROXY_COOKIE_SECRET=""
  BETTER_AUTH_SECRET=$(yaml_get "$STATE_FILE" "better_auth_secret") || BETTER_AUTH_SECRET=""
  JITSI_JWT_SECRET=$(yaml_get "$STATE_FILE" "jitsi_jwt_secret") || JITSI_JWT_SECRET=""
  ZULIP_SECRET_KEY=$(yaml_get "$STATE_FILE" "zulip_secret_key") || ZULIP_SECRET_KEY=""
  ZULIP_RABBITMQ_PASSWORD=$(yaml_get "$STATE_FILE" "zulip_rabbitmq_password") || ZULIP_RABBITMQ_PASSWORD=""
  ZULIP_DB_PASSWORD=$(yaml_get "$STATE_FILE" "zulip_db_password") || ZULIP_DB_PASSWORD=""
else
  echo "  State: generating new secrets"
fi

# Fill any missing secrets
changed=false
if [ -z "${FORGEJO_ADMIN_PASSWORD:-}" ]; then FORGEJO_ADMIN_PASSWORD=$(generate_secret); changed=true; fi
if [ -z "${FORGEJO_DB_PASSWORD:-}" ]; then FORGEJO_DB_PASSWORD=$(generate_secret); changed=true; fi
if [ -z "${MINIO_ROOT_PASSWORD:-}" ]; then MINIO_ROOT_PASSWORD=$(generate_secret); changed=true; fi
if [ -z "${WOODPECKER_AGENT_SECRET:-}" ]; then WOODPECKER_AGENT_SECRET=$(generate_secret); changed=true; fi
if [ -z "${OAUTH2_PROXY_COOKIE_SECRET:-}" ]; then OAUTH2_PROXY_COOKIE_SECRET=$(openssl rand -base64 32 | head -c 32); changed=true; fi
if [ -z "${BETTER_AUTH_SECRET:-}" ]; then BETTER_AUTH_SECRET=$(generate_secret); changed=true; fi
if [ "$JITSI_ENABLED" = "true" ] && [ -z "${JITSI_JWT_SECRET:-}" ]; then JITSI_JWT_SECRET=$(generate_secret); changed=true; fi
if [ "$ZULIP_ENABLED" = "true" ] && [ -z "${ZULIP_SECRET_KEY:-}" ]; then ZULIP_SECRET_KEY=$(generate_secret); changed=true; fi
if [ "$ZULIP_ENABLED" = "true" ] && [ -z "${ZULIP_RABBITMQ_PASSWORD:-}" ]; then ZULIP_RABBITMQ_PASSWORD=$(generate_secret); changed=true; fi
if [ "$ZULIP_ENABLED" = "true" ] && [ -z "${ZULIP_DB_PASSWORD:-}" ]; then ZULIP_DB_PASSWORD=$(generate_secret); changed=true; fi

# Persist state
if [ "$changed" = true ] || [ ! -f "$STATE_FILE" ]; then
  cat > "$STATE_FILE" <<EOF
# Auto-generated secrets — do not commit this file
forgejo_admin_password: ${FORGEJO_ADMIN_PASSWORD}
forgejo_db_password: ${FORGEJO_DB_PASSWORD}
minio_root_password: ${MINIO_ROOT_PASSWORD}
woodpecker_agent_secret: ${WOODPECKER_AGENT_SECRET}
oauth2_proxy_cookie_secret: ${OAUTH2_PROXY_COOKIE_SECRET}
better_auth_secret: ${BETTER_AUTH_SECRET}
jitsi_jwt_secret: ${JITSI_JWT_SECRET:-}
zulip_secret_key: ${ZULIP_SECRET_KEY:-}
zulip_rabbitmq_password: ${ZULIP_RABBITMQ_PASSWORD:-}
zulip_db_password: ${ZULIP_DB_PASSWORD:-}
EOF
  echo "  State: saved to open-platform.state.yaml"
fi

# ── Compute Derived Variables ───────────────────────────────────────────────

# TLS skip verify: true for selfsigned/cloudflare, false for letsencrypt
case "$TLS_MODE" in
  letsencrypt) TLS_SKIP_VERIFY="false" ;;
  *)           TLS_SKIP_VERIFY="true"  ;;
esac

# In-cluster Forgejo URL: always use K8s service DNS (HTTP, no TLS)
FORGEJO_INTERNAL_URL="http://forgejo-http.forgejo.svc.cluster.local:3000"

# SMTP: use external if configured, else bundled Mailpit
if [ -n "$SMTP_EXTERNAL_HOST" ]; then
  SMTP_HOST="$SMTP_EXTERNAL_HOST"
  SMTP_PORT="${SMTP_EXTERNAL_PORT:-587}"
  SMTP_FROM="${SMTP_EXTERNAL_FROM:-forgejo@${DOMAIN}}"
else
  SMTP_HOST="mailpit-smtp.mailpit.svc.cluster.local"
  SMTP_PORT="1025"
  SMTP_FROM="forgejo@${DOMAIN}"
fi

# Cloudflare tunnel ID (empty string disables cloudflared template)
CLOUDFLARE_TUNNEL_ID="${CF_TUNNEL_ID}"

# ── Template Engine ─────────────────────────────────────────────────────────
# Pure sed — no envsubst dependency. Only substitutes known variables.

template_file() {
  local src="$1" dest="$2"
  sed \
    -e "s|\${DOMAIN}|${DOMAIN}|g" \
    -e "s|\${SERVICE_PREFIX}|${SERVICE_PREFIX}|g" \
    -e "s|\${ADMIN_USER}|${ADMIN_USER}|g" \
    -e "s|\${ADMIN_EMAIL}|${ADMIN_EMAIL}|g" \
    -e "s|\${TLS_MODE}|${TLS_MODE}|g" \
    -e "s|\${TLS_EMAIL}|${TLS_EMAIL}|g" \
    -e "s|\${TLS_SKIP_VERIFY}|${TLS_SKIP_VERIFY}|g" \
    -e "s|\${FORGEJO_INTERNAL_URL}|${FORGEJO_INTERNAL_URL}|g" \
    -e "s|\${CLOUDFLARE_TUNNEL_ID}|${CLOUDFLARE_TUNNEL_ID}|g" \
    -e "s|\${SMTP_HOST}|${SMTP_HOST}|g" \
    -e "s|\${SMTP_PORT}|${SMTP_PORT}|g" \
    -e "s|\${SMTP_FROM}|${SMTP_FROM}|g" \
    -e "s|\${JITSI_ALLOW_GUESTS}|${JITSI_ALLOW_GUESTS}|g" \
    -e "s|\${JITSI_JVB_ADVERTISE_IP}|${JITSI_JVB_ADVERTISE_IP}|g" \
    -e "s|\${ZULIP_RABBITMQ_PASSWORD}|${ZULIP_RABBITMQ_PASSWORD}|g" \
    -e "s|\${NETWORK_MODE}|${NETWORK_MODE}|g" \
    -e "s|\${METALLB_TRAEFIK_IP}|${METALLB_TRAEFIK_IP}|g" \
    -e "s|\${METALLB_ADDRESS_POOL}|${METALLB_ADDRESS_POOL}|g" \
    -e "s|\${METALLB_INTERFACE}|${METALLB_INTERFACE}|g" \
    -e "s|\${DOMAIN_TLD}|${DOMAIN_TLD}|g" \
    -e "s|\${MULTINODE}|${MULTINODE}|g" \
    "$src" > "$dest"
}

# ── Template: Helm Values ───────────────────────────────────────────────────

echo ""
echo "Templating helm values..."

template_file "$TEMPLATES_DIR/traefik-values.yaml.tmpl"    "$ROOT_DIR/traefik-values.yaml"
template_file "$TEMPLATES_DIR/forgejo-values.yaml.tmpl"    "$ROOT_DIR/forgejo-values.yaml"
template_file "$TEMPLATES_DIR/woodpecker-values.yaml.tmpl"  "$ROOT_DIR/woodpecker-values.yaml"
template_file "$TEMPLATES_DIR/headlamp-values.yaml.tmpl"    "$ROOT_DIR/headlamp-values.yaml"
template_file "$TEMPLATES_DIR/minio-values.yaml.tmpl"       "$ROOT_DIR/minio-values.yaml"

echo "  traefik-values.yaml"
echo "  forgejo-values.yaml"
echo "  woodpecker-values.yaml"
echo "  headlamp-values.yaml"
echo "  minio-values.yaml"

# Mailpit: only when not using external SMTP
if [ -z "$SMTP_EXTERNAL_HOST" ]; then
  template_file "$TEMPLATES_DIR/mailpit-values.yaml.tmpl" "$ROOT_DIR/mailpit-values.yaml"
  echo "  mailpit-values.yaml"
else
  rm -f "$ROOT_DIR/mailpit-values.yaml"
fi

# Jitsi: optional
if [ "$JITSI_ENABLED" = "true" ]; then
  template_file "$TEMPLATES_DIR/jitsi-values.yaml.tmpl" "$ROOT_DIR/jitsi-values.yaml"
  echo "  jitsi-values.yaml"
else
  rm -f "$ROOT_DIR/jitsi-values.yaml"
fi

# Zulip: optional
if [ "$ZULIP_ENABLED" = "true" ]; then
  template_file "$TEMPLATES_DIR/zulip-values.yaml.tmpl" "$ROOT_DIR/zulip-values.yaml"
  echo "  zulip-values.yaml"
else
  rm -f "$ROOT_DIR/zulip-values.yaml"
fi

# pgAdmin: optional
if [ "$PGADMIN_ENABLED" = "true" ]; then
  template_file "$TEMPLATES_DIR/pgadmin-values.yaml.tmpl" "$ROOT_DIR/pgadmin-values.yaml"
  echo "  pgadmin-values.yaml"
else
  rm -f "$ROOT_DIR/pgadmin-values.yaml"
fi

if [ "$PROVISIONER_ENABLED" = "true" ]; then
  template_file "$TEMPLATES_DIR/provisioner-values.yaml.tmpl" "$ROOT_DIR/provisioner-values.yaml"
  echo "  provisioner-values.yaml"
else
  rm -f "$ROOT_DIR/provisioner-values.yaml"
fi

# MetalLB: only when using loadbalancer mode
if [ "$NETWORK_MODE" = "loadbalancer" ]; then
  template_file "$TEMPLATES_DIR/metallb-values.yaml.tmpl" "$ROOT_DIR/metallb-values.yaml"
  echo "  metallb-values.yaml"
else
  rm -f "$ROOT_DIR/metallb-values.yaml"
fi

# ── Template: Flux Platform Directory ────────────────────────────────────────

echo ""
echo "Templating platform/ directory..."

template_platform() {
  local rel="$1"
  local src="$TEMPLATES_DIR/platform/${rel}.tmpl"
  local dest="$ROOT_DIR/platform/${rel}"
  mkdir -p "$(dirname "$dest")"
  template_file "$src" "$dest"
  echo "  platform/${rel}"
}

# Static platform files (no variable substitution, but managed as templates)
template_platform "kustomization.yaml"
template_platform "cluster/infra-controllers.yaml"
template_platform "cluster/infra-configs.yaml"
template_platform "cluster/identity.yaml"
template_platform "cluster/apps.yaml"
template_platform "infrastructure/controllers/traefik.yaml"
template_platform "infrastructure/controllers/cnpg.yaml"
template_platform "infrastructure/configs/namespaces.yaml"
template_platform "infrastructure/configs/postgres-cluster.yaml"
template_platform "infrastructure/configs/traefik-tls.yaml"
template_platform "apps/woodpecker-rbac.yaml"

# Templated platform files (with variable substitution)
template_platform "identity/oidc-rbac.yaml"
template_platform "identity/forgejo.yaml"
template_platform "apps/woodpecker.yaml"
template_platform "apps/headlamp.yaml"
template_platform "apps/oauth2-proxy.yaml"
template_platform "infrastructure/configs/minio.yaml"
template_platform "infrastructure/configs/oauth2-proxy-middleware.yaml"

# Mailpit: only generate if not using external SMTP
if [ -z "$SMTP_EXTERNAL_HOST" ]; then
  template_platform "apps/mailpit.yaml"
else
  echo "  (skipping mailpit — external SMTP configured)"
  rm -f "$ROOT_DIR/platform/apps/mailpit.yaml"
fi

# Jitsi: only generate if enabled
if [ "$JITSI_ENABLED" = "true" ]; then
  template_platform "apps/jitsi.yaml"
else
  rm -f "$ROOT_DIR/platform/apps/jitsi.yaml"
fi

# Zulip: only generate if enabled
if [ "$ZULIP_ENABLED" = "true" ]; then
  template_platform "apps/zulip.yaml"
else
  rm -f "$ROOT_DIR/platform/apps/zulip.yaml"
fi

# pgAdmin: only generate if enabled
if [ "$PGADMIN_ENABLED" = "true" ]; then
  template_platform "apps/pgadmin.yaml"
else
  rm -f "$ROOT_DIR/platform/apps/pgadmin.yaml"
fi

# Cloudflared: only generate if tunnel is configured
if [ -n "$CLOUDFLARE_TUNNEL_ID" ]; then
  template_platform "infrastructure/configs/cloudflared.yaml"
else
  echo "  (skipping cloudflared — no tunnel configured)"
  rm -f "$ROOT_DIR/platform/infrastructure/configs/cloudflared.yaml"
fi

# cert-manager: only generate if tls.mode == letsencrypt
if [ "$TLS_MODE" = "letsencrypt" ]; then
  template_platform "infrastructure/controllers/cert-manager.yaml"
  template_platform "infrastructure/configs/cluster-issuer.yaml"
else
  rm -f "$ROOT_DIR/platform/infrastructure/controllers/cert-manager.yaml"
  rm -f "$ROOT_DIR/platform/infrastructure/configs/cluster-issuer.yaml"
fi

# MetalLB: only generate if network.mode == loadbalancer
if [ "$NETWORK_MODE" = "loadbalancer" ]; then
  template_platform "infrastructure/controllers/metallb.yaml"
  template_platform "infrastructure/configs/metallb-config.yaml"
else
  rm -f "$ROOT_DIR/platform/infrastructure/controllers/metallb.yaml"
  rm -f "$ROOT_DIR/platform/infrastructure/configs/metallb-config.yaml"
fi

# Regenerate kustomization.yaml files based on what YAML files exist in each directory
for kdir in \
  "$ROOT_DIR/platform/infrastructure/configs" \
  "$ROOT_DIR/platform/infrastructure/controllers" \
  "$ROOT_DIR/platform/identity" \
  "$ROOT_DIR/platform/apps"; do
  KFILE="$kdir/kustomization.yaml"
  if [ -d "$kdir" ]; then
    {
      echo "apiVersion: kustomize.config.k8s.io/v1beta1"
      echo "kind: Kustomization"
      echo "resources:"
      for f in "$kdir"/*.yaml; do
        [ -f "$f" ] || continue
        fname=$(basename "$f")
        [ "$fname" = "kustomization.yaml" ] && continue
        echo "  - $fname"
      done
    } > "$KFILE"
  fi
done

# ── Template: Top-level Flux Directories ─────────────────────────────────────
# These mirror platform/ and are what Flux reads from the Forgejo repo.

echo ""
echo "Templating top-level Flux directories..."

template_flux() {
  local rel="$1"
  local src="$TEMPLATES_DIR/platform/${rel}.tmpl"
  local dest="$ROOT_DIR/${rel}"
  mkdir -p "$(dirname "$dest")"
  template_file "$src" "$dest"
  echo "  ${rel}"
}

template_flux "apps/woodpecker.yaml"
template_flux "apps/headlamp.yaml"
template_flux "apps/oauth2-proxy.yaml"
template_flux "infrastructure/configs/minio.yaml"

# ── Template: Manifests ──────────────────────────────────────────────────────

echo ""
echo "Templating manifests..."

# Regenerate namespaces.yaml from template (includes conditional blocks for optional services)
template_file "$TEMPLATES_DIR/platform/infrastructure/configs/namespaces.yaml.tmpl" "$ROOT_DIR/manifests/namespaces.yaml"
echo "  manifests/namespaces.yaml"

template_file "$TEMPLATES_DIR/platform/infrastructure/configs/postgres-cluster.yaml.tmpl" "$ROOT_DIR/manifests/postgres-cluster.yaml"
echo "  manifests/postgres-cluster.yaml"

template_file "$TEMPLATES_DIR/manifests/oidc-rbac.yaml.tmpl" "$ROOT_DIR/manifests/oidc-rbac.yaml"
echo "  manifests/oidc-rbac.yaml"

if [ "$JITSI_ENABLED" = "true" ]; then
  template_file "$TEMPLATES_DIR/manifests/jitsi-oidc-adapter.yaml.tmpl" "$ROOT_DIR/manifests/jitsi-oidc-adapter.yaml"
  echo "  manifests/jitsi-oidc-adapter.yaml"
else
  rm -f "$ROOT_DIR/manifests/jitsi-oidc-adapter.yaml"
fi

if [ "$PGADMIN_ENABLED" = "true" ]; then
  template_file "$TEMPLATES_DIR/manifests/pgadmin-oauth-config.yaml.tmpl" "$ROOT_DIR/manifests/pgadmin-oauth-config.yaml"
  echo "  manifests/pgadmin-oauth-config.yaml"
else
  rm -f "$ROOT_DIR/manifests/pgadmin-oauth-config.yaml"
fi

if [ "$NETWORK_MODE" = "loadbalancer" ]; then
  template_file "$TEMPLATES_DIR/manifests/metallb-config.yaml.tmpl" "$ROOT_DIR/manifests/metallb-config.yaml"
  echo "  manifests/metallb-config.yaml"
else
  rm -f "$ROOT_DIR/manifests/metallb-config.yaml"
fi

# ── Template: helmfile.yaml ───────────────────────────────────────────────────

echo ""
echo "Templating helmfile.yaml..."

template_file "$TEMPLATES_DIR/helmfile.yaml.tmpl" "$ROOT_DIR/helmfile.yaml"

# Conditional: remove cert-manager block if not using letsencrypt
if [ "$TLS_MODE" != "letsencrypt" ]; then
  sed_i '/# BEGIN cert-manager/,/# END cert-manager/d' "$ROOT_DIR/helmfile.yaml"
  echo "  helmfile.yaml (cert-manager excluded — tls.mode=${TLS_MODE})"
else
  echo "  helmfile.yaml (cert-manager included)"
fi

# Conditional: remove mailpit block if using external SMTP
if [ -n "$SMTP_EXTERNAL_HOST" ]; then
  sed_i '/# BEGIN mailpit/,/# END mailpit/d' "$ROOT_DIR/helmfile.yaml"
  echo "  mailpit excluded (external SMTP)"
fi

# Conditional: remove jitsi block if not enabled
if [ "$JITSI_ENABLED" != "true" ]; then
  sed_i '/# BEGIN jitsi/,/# END jitsi/d' "$ROOT_DIR/helmfile.yaml"
  sed_i '/# BEGIN jitsi/,/# END jitsi/d' "$ROOT_DIR/manifests/namespaces.yaml"
  sed_i '/# BEGIN jitsi/,/# END jitsi/d' "$ROOT_DIR/platform/infrastructure/configs/namespaces.yaml"
  echo "  jitsi excluded"
fi

# Conditional: remove zulip block if not enabled
if [ "$ZULIP_ENABLED" != "true" ]; then
  sed_i '/# BEGIN zulip/,/# END zulip/d' "$ROOT_DIR/helmfile.yaml"
  sed_i '/# BEGIN zulip/,/# END zulip/d' "$ROOT_DIR/manifests/namespaces.yaml"
  sed_i '/# BEGIN zulip/,/# END zulip/d' "$ROOT_DIR/platform/infrastructure/configs/namespaces.yaml"
  sed_i '/# BEGIN zulip/,/# END zulip/d' "$ROOT_DIR/manifests/postgres-cluster.yaml"
  sed_i '/# BEGIN zulip/,/# END zulip/d' "$ROOT_DIR/platform/infrastructure/configs/postgres-cluster.yaml"
  echo "  zulip excluded"
fi

# Conditional: remove pgadmin block if not enabled
if [ "$PGADMIN_ENABLED" != "true" ]; then
  sed_i '/# BEGIN pgadmin/,/# END pgadmin/d' "$ROOT_DIR/helmfile.yaml"
  sed_i '/# BEGIN pgadmin/,/# END pgadmin/d' "$ROOT_DIR/manifests/namespaces.yaml"
  sed_i '/# BEGIN pgadmin/,/# END pgadmin/d' "$ROOT_DIR/platform/infrastructure/configs/namespaces.yaml"
  echo "  pgadmin excluded"
fi

# Conditional: remove provisioner block if not enabled
if [ "$PROVISIONER_ENABLED" != "true" ]; then
  sed_i '/# BEGIN provisioner/,/# END provisioner/d' "$ROOT_DIR/helmfile.yaml"
  sed_i '/# BEGIN provisioner/,/# END provisioner/d' "$ROOT_DIR/manifests/namespaces.yaml"
  sed_i '/# BEGIN provisioner/,/# END provisioner/d' "$ROOT_DIR/platform/infrastructure/configs/namespaces.yaml"
  echo "  provisioner excluded"
else
  echo "  provisioner included"
fi

# Conditional: remove metallb blocks if not using loadbalancer
if [ "$NETWORK_MODE" != "loadbalancer" ]; then
  sed_i '/# BEGIN metallb/,/# END metallb/d' "$ROOT_DIR/helmfile.yaml"
  sed_i '/# BEGIN metallb/,/# END metallb/d' "$ROOT_DIR/manifests/namespaces.yaml"
  sed_i '/# BEGIN metallb/,/# END metallb/d' "$ROOT_DIR/platform/infrastructure/configs/namespaces.yaml"
  echo "  metallb excluded (network.mode=${NETWORK_MODE})"
fi

# Conditional: remove inapplicable traefik mode blocks
if [ "$NETWORK_MODE" = "loadbalancer" ]; then
  sed_i '/# BEGIN host-network/,/# END host-network/d' "$ROOT_DIR/traefik-values.yaml"
  sed_i '/# BEGIN host-network/,/# END host-network/d' "$ROOT_DIR/platform/infrastructure/controllers/traefik.yaml"
  echo "  traefik: loadbalancer mode (VIP: ${METALLB_TRAEFIK_IP})"
else
  sed_i '/# BEGIN loadbalancer/,/# END loadbalancer/d' "$ROOT_DIR/traefik-values.yaml"
  sed_i '/# BEGIN loadbalancer/,/# END loadbalancer/d' "$ROOT_DIR/platform/infrastructure/controllers/traefik.yaml"
  echo "  traefik: host-network mode"
fi

# Clean up surviving mode markers from the active block
for f in "$ROOT_DIR/traefik-values.yaml" "$ROOT_DIR/platform/infrastructure/controllers/traefik.yaml"; do
  [ -f "$f" ] && sed_i '/# BEGIN host-network/d; /# END host-network/d; /# BEGIN loadbalancer/d; /# END loadbalancer/d' "$f"
done

# Conditional: remove infrastructure components if using external mode
if [ "$INFRA_MODE" = "external" ]; then
  sed_i '/# BEGIN infra-traefik/,/# END infra-traefik/d' "$ROOT_DIR/helmfile.yaml"
  sed_i '/# BEGIN infra-cnpg/,/# END infra-cnpg/d' "$ROOT_DIR/helmfile.yaml"
  # Remove Flux-managed infrastructure controllers (external infra has its own lifecycle)
  rm -f "$ROOT_DIR/platform/infrastructure/controllers/traefik.yaml"
  rm -f "$ROOT_DIR/platform/infrastructure/controllers/cnpg.yaml"

  # If infra-controllers directory is now empty (no cert-manager, no metallb),
  # remove the Flux Kustomization that points to it to avoid empty-directory errors
  CONTROLLER_COUNT=$(find "$ROOT_DIR/platform/infrastructure/controllers/" -name '*.yaml' ! -name 'kustomization.yaml' 2>/dev/null | wc -l)
  if [ "$CONTROLLER_COUNT" -eq 0 ]; then
    rm -f "$ROOT_DIR/platform/cluster/infra-controllers.yaml"
    # Update infra-configs to not depend on infra-controllers
    [ -f "$ROOT_DIR/platform/cluster/infra-configs.yaml" ] && \
      sed_i '/dependsOn/,/name: infra-controllers/d' "$ROOT_DIR/platform/cluster/infra-configs.yaml"
  fi

  # Flux: in external mode, skip installing Flux controllers (expect pre-installed)
  sed_i '/# BEGIN infra-flux/,/# END infra-flux/d' "$ROOT_DIR/helmfile.yaml"

  # cert-manager and metallb are already conditional on tls.mode and network.mode
  echo "  infrastructure: external (traefik, cnpg, flux skipped — expected pre-installed)"
else
  # Bundled mode: remove the external bootstrap releases
  sed_i '/# BEGIN infra-external/,/# END infra-external/d' "$ROOT_DIR/helmfile.yaml"
  sed_i '/# BEGIN flux-external/,/# END flux-external/d' "$ROOT_DIR/helmfile.yaml"
fi

# Strip multinode blocks if single-node
if [ "$MULTINODE" != "true" ]; then
  for f in "$ROOT_DIR"/manifests/*.yaml \
           "$ROOT_DIR"/platform/infrastructure/configs/*.yaml \
           "$ROOT_DIR"/*-values.yaml; do
    [ -f "$f" ] && sed_i '/# BEGIN multinode/,/# END multinode/d' "$f"
  done
fi

# ── Generate .env (backward compatibility) ──────────────────────────────────

echo ""
echo "Generating .env..."

cat > "$ROOT_DIR/.env" <<EOF
# Auto-generated by generate-config.sh — do not edit directly.
# Edit open-platform.yaml instead, then re-run: ./scripts/generate-config.sh

PLATFORM_DOMAIN=${DOMAIN}
SERVICE_PREFIX=${SERVICE_PREFIX}
FORGEJO_ADMIN_USER=${ADMIN_USER}
FORGEJO_ADMIN_PASSWORD=${FORGEJO_ADMIN_PASSWORD}
FORGEJO_DB_PASSWORD=${FORGEJO_DB_PASSWORD}
MINIO_ROOT_USER=admin
MINIO_ROOT_PASSWORD=${MINIO_ROOT_PASSWORD}
WOODPECKER_AGENT_SECRET=${WOODPECKER_AGENT_SECRET}
OAUTH2_PROXY_COOKIE_SECRET=${OAUTH2_PROXY_COOKIE_SECRET}
BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}
SMTP_HOST=${SMTP_HOST}
SMTP_PORT=${SMTP_PORT}
SMTP_FROM=${SMTP_FROM}
NETWORK_MODE=${NETWORK_MODE}
INFRA_MODE=${INFRA_MODE}
MULTINODE=${MULTINODE}
EOF

# External SMTP credentials
if [ -n "$SMTP_EXTERNAL_HOST" ] && [ -n "$SMTP_EXTERNAL_USER" ]; then
  cat >> "$ROOT_DIR/.env" <<EOF

# External SMTP
SMTP_USERNAME=${SMTP_EXTERNAL_USER}
SMTP_PASSWORD=${SMTP_EXTERNAL_PASS}
EOF
fi

# Jitsi secrets
if [ "$JITSI_ENABLED" = "true" ]; then
  cat >> "$ROOT_DIR/.env" <<EOF

# Jitsi
JITSI_JWT_SECRET=${JITSI_JWT_SECRET}
JITSI_JVB_ADVERTISE_IP=${JITSI_JVB_ADVERTISE_IP}
EOF
fi

# Zulip secrets
if [ "$ZULIP_ENABLED" = "true" ]; then
  cat >> "$ROOT_DIR/.env" <<EOF

# Zulip
ZULIP_SECRET_KEY=${ZULIP_SECRET_KEY}
ZULIP_RABBITMQ_PASSWORD=${ZULIP_RABBITMQ_PASSWORD}
ZULIP_DB_PASSWORD=${ZULIP_DB_PASSWORD}
EOF
fi

# Cloudflare settings
if [ -n "$CF_TUNNEL_ID" ]; then
  cat >> "$ROOT_DIR/.env" <<EOF

# Cloudflare tunnel
CLOUDFLARE_ACCOUNT_TAG=${CF_ACCOUNT_TAG}
CLOUDFLARE_TUNNEL_ID=${CF_TUNNEL_ID}
CLOUDFLARE_TUNNEL_SECRET=${CF_TUNNEL_SECRET}
EOF
fi

echo "  .env"

# ── Self-signed certs (only for selfsigned/cloudflare mode) ──────────────────

if [ "$TLS_MODE" != "letsencrypt" ]; then
  CERTS_DIR="$ROOT_DIR/certs"
  # Regenerate if no cert exists or if existing cert doesn't cover this domain
  NEED_CERTS=false
  if [ ! -f "$CERTS_DIR/ca.crt" ] || [ ! -f "$CERTS_DIR/wildcard.crt" ] || [ ! -f "$CERTS_DIR/ca.key" ] || [ ! -f "$CERTS_DIR/wildcard.key" ]; then
    NEED_CERTS=true
  elif ! openssl x509 -in "$CERTS_DIR/wildcard.crt" -noout -text 2>/dev/null | grep -q "*.${DOMAIN}"; then
    echo "  Existing cert doesn't cover *.${DOMAIN} — regenerating"
    NEED_CERTS=true
  fi
  if [ "$NEED_CERTS" = true ]; then
    echo ""
    echo "Generating self-signed CA + wildcard cert..."
    mkdir -p "$CERTS_DIR"

    # CA
    openssl genrsa -out "$CERTS_DIR/ca.key" 4096 2>/dev/null
    cat > "$CERTS_DIR/ca.cnf" <<CAEOF
[req]
distinguished_name = req_dn
x509_extensions = v3_ca
prompt = no

[req_dn]
CN = OpenPlatform Local CA

[v3_ca]
basicConstraints = critical, CA:TRUE
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid:always, issuer
keyUsage = critical, keyCertSign, cRLSign
CAEOF
    openssl req -x509 -new -nodes -key "$CERTS_DIR/ca.key" \
      -sha256 -days 3650 -out "$CERTS_DIR/ca.crt" \
      -config "$CERTS_DIR/ca.cnf" 2>/dev/null
    rm -f "$CERTS_DIR/ca.cnf"

    # Wildcard cert
    openssl genrsa -out "$CERTS_DIR/wildcard.key" 2048 2>/dev/null
    cat > "$CERTS_DIR/san.cnf" <<SANEOF
[req]
distinguished_name = req_dn
req_extensions = v3_req
prompt = no

[req_dn]
CN = *.${DOMAIN}

[v3_req]
subjectAltName = @alt_names

[alt_names]
DNS.1 = *.${DOMAIN}
DNS.2 = ${DOMAIN}
SANEOF

    openssl req -new -key "$CERTS_DIR/wildcard.key" \
      -out "$CERTS_DIR/wildcard.csr" \
      -config "$CERTS_DIR/san.cnf" 2>/dev/null
    openssl x509 -req -in "$CERTS_DIR/wildcard.csr" \
      -CA "$CERTS_DIR/ca.crt" -CAkey "$CERTS_DIR/ca.key" \
      -CAcreateserial -out "$CERTS_DIR/wildcard.crt" \
      -days 3650 -sha256 \
      -extfile "$CERTS_DIR/san.cnf" -extensions v3_req 2>/dev/null
    rm -f "$CERTS_DIR/wildcard.csr" "$CERTS_DIR/san.cnf" "$CERTS_DIR/ca.srl"

    echo "  certs/ca.crt"
    echo "  certs/wildcard.crt"
  fi
fi

# ── Summary ──────────────────────────────────────────────────────────────────

echo ""
echo "Config generated for ${DOMAIN}"
echo ""
echo "Services:"
echo "  Forgejo:    https://${SERVICE_PREFIX}forgejo.${DOMAIN}"
echo "  Woodpecker: https://${SERVICE_PREFIX}ci.${DOMAIN}"
echo "  Headlamp:   https://${SERVICE_PREFIX}headlamp.${DOMAIN}"
echo "  MinIO:      https://${SERVICE_PREFIX}minio.${DOMAIN}"
echo "  S3 API:     https://${SERVICE_PREFIX}s3.${DOMAIN}"
echo "  OAuth2:     https://${SERVICE_PREFIX}oauth2.${DOMAIN}"
if [ -z "$SMTP_EXTERNAL_HOST" ]; then
  echo "  Mailpit:    https://${SERVICE_PREFIX}mail.${DOMAIN}"
fi
if [ "$JITSI_ENABLED" = "true" ]; then
  echo "  Jitsi:      https://${SERVICE_PREFIX}meet.${DOMAIN}"
fi
if [ "$ZULIP_ENABLED" = "true" ]; then
  echo "  Zulip:      https://${SERVICE_PREFIX}chat.${DOMAIN}"
fi
if [ "$PGADMIN_ENABLED" = "true" ]; then
  echo "  pgAdmin:    https://${SERVICE_PREFIX}db.${DOMAIN}"
fi
echo ""
echo "Next: make deploy"
