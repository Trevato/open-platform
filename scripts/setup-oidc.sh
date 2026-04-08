#!/usr/bin/env bash
set -euo pipefail

# Configures Colima VM for self-signed TLS: installs CA cert, sets up
# /etc/hosts for service DNS, and configures containerd registry.
#
# On Colima: installs CA, configures hosts + containerd, restarts containerd.
# Otherwise: no-op (NixOS and VxRail handle this declaratively).
#
# Idempotent — safe to run on every deploy.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
DOMAIN="${PLATFORM_DOMAIN:?PLATFORM_DOMAIN not set}"
PREFIX="${SERVICE_PREFIX:-}"

# ── Functions ──────────────────────────────────────────────────────────────

setup_colima() {
  local profile="$1"
  echo "Configuring Colima VM (profile: ${profile})..."

  # Get the VM's routable network IP for /etc/hosts
  local NODE_IP
  NODE_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}' 2>/dev/null \
    | tr ' ' '\n' | grep -E '^[0-9]+\.' | head -1)
  if [ -z "$NODE_IP" ]; then
    NODE_IP=$(colima ssh -p "$profile" -- ip -4 addr show col0 2>/dev/null | grep -oP 'inet \K[0-9.]+' || echo "")
  fi
  if [ -z "$NODE_IP" ]; then
    echo "  Warning: Could not determine node IP — skipping /etc/hosts."
  fi

  # 1. Install CA cert
  if [ -f "$ROOT_DIR/certs/ca.crt" ]; then
    cat "$ROOT_DIR/certs/ca.crt" | colima ssh -p "$profile" -- sudo tee /usr/local/share/ca-certificates/openplatform.crt > /dev/null 2>&1
    colima ssh -p "$profile" -- sudo update-ca-certificates 2>&1 | grep -v "^$" || true
    echo "  CA cert installed."
  fi

  # 2. Add/update /etc/hosts entries (k3s process uses host DNS, not CoreDNS)
  if [ -n "$NODE_IP" ]; then
    local HOSTS_LINE="${NODE_IP} ${PREFIX}forgejo.${DOMAIN} ${PREFIX}ci.${DOMAIN} ${PREFIX}minio.${DOMAIN} ${PREFIX}s3.${DOMAIN} ${PREFIX}oauth2.${DOMAIN}"
    local CURRENT_ENTRY
    CURRENT_ENTRY=$(colima ssh -p "$profile" -- grep "forgejo.${DOMAIN}" /etc/hosts 2>/dev/null || echo "")
    if [ -z "$CURRENT_ENTRY" ]; then
      colima ssh -p "$profile" -- sudo sh -c "echo '${HOSTS_LINE}' >> /etc/hosts"
      echo "  /etc/hosts added: *.${DOMAIN} → ${NODE_IP}"
    elif [ "$CURRENT_ENTRY" != "$HOSTS_LINE" ]; then
      colima ssh -p "$profile" -- sudo sed -i "/forgejo.${DOMAIN}/d" /etc/hosts
      colima ssh -p "$profile" -- sudo sh -c "echo '${HOSTS_LINE}' >> /etc/hosts"
      echo "  /etc/hosts updated: *.${DOMAIN} → ${NODE_IP}"
    else
      echo "  /etc/hosts already correct."
    fi
  fi

  # 3. Configure containerd registry (for image pulls with self-signed certs)
  colima ssh -p "$profile" -- sudo mkdir -p "/etc/containerd/certs.d/${PREFIX}forgejo.${DOMAIN}" 2>/dev/null
  colima ssh -p "$profile" -- sudo tee "/etc/containerd/certs.d/${PREFIX}forgejo.${DOMAIN}/hosts.toml" > /dev/null <<EOF
server = "https://${PREFIX}forgejo.${DOMAIN}"

[host."https://${PREFIX}forgejo.${DOMAIN}"]
  ca = "/usr/local/share/ca-certificates/openplatform.crt"
  skip_verify = true
EOF

  # Ensure containerd config references certs.d
  local CURRENT_CONFIG
  CURRENT_CONFIG=$(colima ssh -p "$profile" -- cat /etc/containerd/config.toml 2>/dev/null || echo "")
  if ! echo "$CURRENT_CONFIG" | grep -q "config_path"; then
    colima ssh -p "$profile" -- sudo tee /etc/containerd/config.toml > /dev/null <<'CEOF'
[grpc]
gid = 1000

[plugins."io.containerd.cri.v1.images".registry]
config_path = "/etc/containerd/certs.d"
CEOF
    echo "  containerd registry config installed."
  fi

  # 4. Restart containerd to pick up registry config
  colima ssh -p "$profile" -- sudo systemctl restart containerd 2>/dev/null || true
  echo "  containerd restarted."
}

# ── Main ───────────────────────────────────────────────────────────────────

COLIMA_PROFILE=""
if command -v colima &>/dev/null; then
  CURRENT_CTX=$(kubectl config current-context 2>/dev/null || echo "")
  if [[ "$CURRENT_CTX" == colima-* ]]; then
    COLIMA_PROFILE="${CURRENT_CTX#colima-}"
  fi
fi

if [ -n "$COLIMA_PROFILE" ]; then
  setup_colima "$COLIMA_PROFILE"
else
  echo "Not running on Colima — skipping VM setup."
fi
