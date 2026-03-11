#!/usr/bin/env bash
set -euo pipefail

# Configures k3s API server OIDC flags so Headlamp tokens are validated.
# Also installs the platform CA cert and container registry config.
#
# On Colima: writes /etc/rancher/k3s/config.yaml, installs CA, restarts k3s.
# Otherwise: prints instructions for manual k3s OIDC configuration.
#
# Idempotent — safe to run on every deploy. Only restarts k3s if config changed.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
DOMAIN="${PLATFORM_DOMAIN:?PLATFORM_DOMAIN not set}"

# Read Headlamp OIDC client ID from K8s secret
OIDC_CLIENT_ID=$(kubectl get secret oidc -n headlamp -o jsonpath='{.data.OIDC_CLIENT_ID}' 2>/dev/null | base64 -d 2>/dev/null)
if [ -z "$OIDC_CLIENT_ID" ]; then
  echo "Warning: Headlamp OIDC secret not found — skipping OIDC setup."
  echo "  (Run setup-oauth2.sh first to create the secret.)"
  exit 0
fi

OIDC_ISSUER="https://forgejo.${DOMAIN}"

# ── Functions ──────────────────────────────────────────────────────────────

setup_colima() {
  local profile="$1"
  echo "Configuring k3s OIDC on Colima (profile: ${profile})..."

  # Get the VM's routable network IP for /etc/hosts
  # Prefer kubectl (gives the advertised node IP), fall back to col0 interface IP
  local NODE_IP
  NODE_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}' 2>/dev/null \
    | tr ' ' '\n' | grep -E '^[0-9]+\.' | head -1)
  if [ -z "$NODE_IP" ]; then
    # Fall back to col0 interface (Colima's routable network)
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
    local HOSTS_LINE="${NODE_IP} forgejo.${DOMAIN} ci.${DOMAIN} headlamp.${DOMAIN} minio.${DOMAIN} s3.${DOMAIN} oauth2.${DOMAIN}"
    local CURRENT_ENTRY
    CURRENT_ENTRY=$(colima ssh -p "$profile" -- grep "forgejo.${DOMAIN}" /etc/hosts 2>/dev/null || echo "")
    if [ -z "$CURRENT_ENTRY" ]; then
      colima ssh -p "$profile" -- sudo sh -c "echo '${HOSTS_LINE}' >> /etc/hosts"
      echo "  /etc/hosts added: *.${DOMAIN} → ${NODE_IP}"
    elif [ "$CURRENT_ENTRY" != "$HOSTS_LINE" ]; then
      # Update stale entry (IP may have changed)
      colima ssh -p "$profile" -- sudo sed -i "/forgejo.${DOMAIN}/d" /etc/hosts
      colima ssh -p "$profile" -- sudo sh -c "echo '${HOSTS_LINE}' >> /etc/hosts"
      echo "  /etc/hosts updated: *.${DOMAIN} → ${NODE_IP}"
    else
      echo "  /etc/hosts already correct."
    fi
  fi

  # 3. Configure containerd registry (for image pulls with self-signed certs)
  colima ssh -p "$profile" -- sudo mkdir -p "/etc/containerd/certs.d/forgejo.${DOMAIN}" 2>/dev/null
  colima ssh -p "$profile" -- sudo tee "/etc/containerd/certs.d/forgejo.${DOMAIN}/hosts.toml" > /dev/null <<EOF
server = "https://forgejo.${DOMAIN}"

[host."https://forgejo.${DOMAIN}"]
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

  # 4. Write k3s OIDC config
  local K3S_CONFIG
  K3S_CONFIG="kube-apiserver-arg:
  - \"oidc-issuer-url=${OIDC_ISSUER}\"
  - \"oidc-client-id=${OIDC_CLIENT_ID}\"
  - \"oidc-username-claim=preferred_username\"
  - \"oidc-username-prefix=-\"
  - \"oidc-groups-claim=groups\"
  - \"oidc-ca-file=/usr/local/share/ca-certificates/openplatform.crt\""

  # Check if config already matches
  local EXISTING_CONFIG
  EXISTING_CONFIG=$(colima ssh -p "$profile" -- sudo cat /etc/rancher/k3s/config.yaml 2>/dev/null || echo "")

  local NEEDS_K3S_RESTART=false
  if [ "$EXISTING_CONFIG" != "$K3S_CONFIG" ]; then
    echo "$K3S_CONFIG" | colima ssh -p "$profile" -- sudo tee /etc/rancher/k3s/config.yaml > /dev/null
    echo "  k3s OIDC config written."
    NEEDS_K3S_RESTART=true
  else
    echo "  k3s OIDC config already up to date."
  fi

  # 5. Restart containerd (always, to pick up registry config)
  colima ssh -p "$profile" -- sudo systemctl restart containerd 2>/dev/null || true

  # 6. Restart k3s only if OIDC config changed
  if [ "$NEEDS_K3S_RESTART" = true ]; then
    echo "  Restarting k3s..."
    colima ssh -p "$profile" -- sudo systemctl restart k3s 2>/dev/null &
    local K3S_PID=$!

    # Wait for k3s to come back (up to 90s)
    local RETRIES=0
    while [ $RETRIES -lt 18 ]; do
      sleep 5
      if kubectl get nodes --request-timeout=5s &>/dev/null; then
        echo "  k3s restarted with OIDC config."
        wait $K3S_PID 2>/dev/null || true
        # Wait for critical services to recover after k3s restart
        echo "  Waiting for services to recover..."
        local SVC_RETRIES=0
        while [ $SVC_RETRIES -lt 24 ]; do
          WP_READY=$(kubectl get pods -n woodpecker -l app.kubernetes.io/name=server -o jsonpath='{.items[0].status.conditions[?(@.type=="Ready")].status}' 2>/dev/null)
          FG_READY=$(kubectl get pods -n forgejo -l app.kubernetes.io/name=forgejo -o jsonpath='{.items[0].status.conditions[?(@.type=="Ready")].status}' 2>/dev/null)
          if [ "$WP_READY" = "True" ] && [ "$FG_READY" = "True" ]; then
            echo "  Services recovered."
            break
          fi
          sleep 5
          SVC_RETRIES=$((SVC_RETRIES + 1))
        done
        return 0
      fi
      RETRIES=$((RETRIES + 1))
    done

    echo "  Warning: k3s restart taking longer than expected. It may still be coming up."
    wait $K3S_PID 2>/dev/null || true
  fi
}

setup_manual() {
  echo ""
  echo "k3s OIDC configuration (manual setup required):"
  echo ""
  echo "Add the following flags to your k3s server configuration."
  echo ""
  echo "For NixOS (services.k3s.extraFlags):"
  echo ""
  echo "  services.k3s.extraFlags = ["
  echo "    \"--kube-apiserver-arg=oidc-issuer-url=${OIDC_ISSUER}\""
  echo "    \"--kube-apiserver-arg=oidc-client-id=${OIDC_CLIENT_ID}\""
  echo "    \"--kube-apiserver-arg=oidc-username-claim=preferred_username\""
  echo "    \"--kube-apiserver-arg=oidc-username-prefix=-\""
  echo "    \"--kube-apiserver-arg=oidc-groups-claim=groups\""
  echo "  ];"
  echo ""
  echo "For /etc/rancher/k3s/config.yaml:"
  echo ""
  echo "  kube-apiserver-arg:"
  echo "    - \"oidc-issuer-url=${OIDC_ISSUER}\""
  echo "    - \"oidc-client-id=${OIDC_CLIENT_ID}\""
  echo "    - \"oidc-username-claim=preferred_username\""
  echo "    - \"oidc-username-prefix=-\""
  echo "    - \"oidc-groups-claim=groups\""
  echo ""
  echo "Then restart k3s for the changes to take effect."
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
  setup_manual
fi
