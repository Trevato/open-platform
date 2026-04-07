#!/usr/bin/env bash
set -euo pipefail

# Starts a Colima VM as a k3s agent node.
# Colima doesn't support native agent mode, so we start a plain VM
# and install k3s agent inside it.
#
# Usage: ./nix/scripts/colima-agent.sh [--server-ip IP] [--token TOKEN] [--ssh-host HOST] [--profile NAME]
#
# Token resolution order:
#   1. --token flag (explicit)
#   2. Local file /var/lib/rancher/k3s/server/node-token (when run on server)
#   3. SSH fetch via --ssh-host (e.g., --ssh-host vxrail)
#
# Requires: the k3s server must be reachable from the Colima VM.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"

# Defaults
PROFILE="mac-node"
SERVER_IP=""
K3S_TOKEN=""
SSH_HOST=""
CPU="${OP_COLIMA_CPU:-4}"
MEMORY="${OP_COLIMA_MEMORY:-8}"
DISK="${OP_COLIMA_DISK:-50}"

# Parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    --server-ip) SERVER_IP="$2"; shift 2 ;;
    --token) K3S_TOKEN="$2"; shift 2 ;;
    --ssh-host) SSH_HOST="$2"; shift 2 ;;
    --profile) PROFILE="$2"; shift 2 ;;
    --cpu) CPU="$2"; shift 2 ;;
    --memory) MEMORY="$2"; shift 2 ;;
    --disk) DISK="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

# Load platform config
if [ -f "$ROOT_DIR/.env" ]; then
  set -a; source "$ROOT_DIR/.env"; set +a
fi
DOMAIN="${PLATFORM_DOMAIN:-}"

# Detect server IP if not provided
# Prefer ExternalIP (Tailscale) for cross-network connectivity
if [ -z "$SERVER_IP" ]; then
  SERVER_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="ExternalIP")].address}' \
    2>/dev/null | tr ' ' '\n' | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | head -1)
  if [ -z "$SERVER_IP" ]; then
    SERVER_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}' \
      2>/dev/null | tr ' ' '\n' | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | head -1)
  fi
  if [ -z "$SERVER_IP" ]; then
    echo "Error: Cannot detect server IP. Provide --server-ip."
    exit 1
  fi
fi

K3S_URL="https://${SERVER_IP}:6443"

# Get join token (try: flag → local file → SSH)
if [ -z "$K3S_TOKEN" ]; then
  TOKEN_FILE="/var/lib/rancher/k3s/server/node-token"
  if [ -f "$TOKEN_FILE" ]; then
    K3S_TOKEN=$(cat "$TOKEN_FILE")
  elif [ -n "$SSH_HOST" ]; then
    echo "Fetching join token via SSH from ${SSH_HOST}..."
    K3S_TOKEN=$(ssh -o ConnectTimeout=10 "$SSH_HOST" "sudo cat /var/lib/rancher/k3s/server/node-token" 2>/dev/null)
    if [ -z "$K3S_TOKEN" ]; then
      echo "Error: Failed to fetch token via SSH from ${SSH_HOST}"
      exit 1
    fi
    echo "  Token retrieved."
  else
    echo "Error: k3s join token not available."
    echo "  Options:"
    echo "    --token TOKEN       Provide token directly"
    echo "    --ssh-host HOST     Fetch token via SSH (requires sudo access)"
    echo "    Run on server       Token is read from $TOKEN_FILE"
    exit 1
  fi
fi

echo "=== Colima Agent Setup ==="
echo "  Profile:    ${PROFILE}"
echo "  Server:     ${K3S_URL}"
echo "  CPU:        ${CPU}"
echo "  Memory:     ${MEMORY}GB"
echo "  Disk:       ${DISK}GB"
echo ""

# ── Step 1: Ensure Colima VM ──────────────────────────────────────────

COLIMA_STATUS=$(colima status "$PROFILE" 2>&1 || echo "not running")

if echo "$COLIMA_STATUS" | grep -q "Running"; then
  # Check if this VM has k3s server (from --kubernetes flag)
  if colima ssh -p "$PROFILE" -- pgrep k3s-server &>/dev/null 2>&1; then
    echo "Warning: Colima profile '${PROFILE}' is running k3s server."
    echo "  Deleting and recreating without --kubernetes..."
    colima delete "$PROFILE" --force
    COLIMA_STATUS="not running"
  elif colima ssh -p "$PROFILE" -- pgrep k3s-agent &>/dev/null 2>&1; then
    echo "k3s agent already running in Colima profile '${PROFILE}'."
    echo "  Checking node status..."

    # Get hostname from VM for node lookup
    VM_HOSTNAME=$(colima ssh -p "$PROFILE" -- hostname 2>/dev/null || echo "")
    if kubectl get node "$VM_HOSTNAME" &>/dev/null 2>&1; then
      echo "  Node '${VM_HOSTNAME}' is already in the cluster."
      kubectl label node "$VM_HOSTNAME" "open-platform.sh/node-role=worker" --overwrite 2>/dev/null || true
      exit 0
    fi
  fi
fi

if echo "$COLIMA_STATUS" | grep -qi "not running\|not found\|not exist"; then
  echo "Starting Colima VM (without --kubernetes)..."
  colima start "$PROFILE" \
    --runtime containerd \
    --network-address \
    --cpu "$CPU" \
    --memory "$MEMORY" \
    --disk "$DISK"
fi

echo ""

# ── Step 2: Test connectivity ─────────────────────────────────────────

echo "Testing connectivity to ${K3S_URL}..."
if colima ssh -p "$PROFILE" -- curl -sk --connect-timeout 5 "https://${SERVER_IP}:6443/healthz" >/dev/null 2>&1; then
  echo "  OK — can reach server."
else
  echo "  WARNING: Cannot reach ${SERVER_IP}:6443 from the VM."
  echo ""
  echo "  Possible fixes:"
  echo "    1. If using Tailscale: install Tailscale in the VM"
  echo "    2. If using LAN: ensure routing from 192.168.64.x to ${SERVER_IP}"
  echo "    3. Try a different --server-ip that the VM can reach"
  echo ""
  echo "  Continuing anyway — k3s agent will retry connection..."
fi

echo ""

# ── Step 3: Install k3s agent ─────────────────────────────────────────

echo "Installing k3s agent..."
# Detect Tailscale IP for cross-network Flannel VXLAN (preferred over Lima/bridge IPs)
TS_IP=$(colima ssh -p "$PROFILE" -- tailscale ip -4 2>/dev/null || echo "")
if [ -n "$TS_IP" ]; then
  VM_IP="$TS_IP"
  # Detect Tailscale interface name for Flannel VXLAN binding
  TS_IFACE=$(colima ssh -p "$PROFILE" -- ip -o addr show 2>/dev/null | grep "$TS_IP" | awk '{print $2}')
  AGENT_FLAGS="agent --node-ip=${VM_IP} --node-external-ip=${VM_IP} --flannel-iface=${TS_IFACE:-tailscale0}"
  echo "  Using Tailscale IP: ${VM_IP} (iface: ${TS_IFACE:-tailscale0})"
else
  VM_IP=$(colima ssh -p "$PROFILE" -- hostname -I 2>/dev/null | awk '{print $1}')
  AGENT_FLAGS="agent"
  if [ -n "$VM_IP" ]; then
    AGENT_FLAGS="agent --node-external-ip=${VM_IP}"
  fi
fi
colima ssh -p "$PROFILE" -- sh -c \
  "curl -sfL https://get.k3s.io | K3S_URL='${K3S_URL}' K3S_TOKEN='${K3S_TOKEN}' INSTALL_K3S_EXEC='${AGENT_FLAGS}' sh -"

echo ""

# ── Step 4: Install CA cert + containerd registry ─────────────────────

if [ -f "$ROOT_DIR/certs/ca.crt" ] && [ -n "$DOMAIN" ]; then
  echo "Installing CA cert and containerd registry config..."

  cat "$ROOT_DIR/certs/ca.crt" | colima ssh -p "$PROFILE" -- sudo tee /usr/local/share/ca-certificates/openplatform.crt > /dev/null
  colima ssh -p "$PROFILE" -- sudo update-ca-certificates 2>&1 | grep -v "^$" || true

  colima ssh -p "$PROFILE" -- sudo mkdir -p "/etc/containerd/certs.d/forgejo.${DOMAIN}" 2>/dev/null
  colima ssh -p "$PROFILE" -- sudo tee "/etc/containerd/certs.d/forgejo.${DOMAIN}/hosts.toml" > /dev/null <<EOF
server = "https://forgejo.${DOMAIN}"

[host."https://forgejo.${DOMAIN}"]
  ca = "/usr/local/share/ca-certificates/openplatform.crt"
  skip_verify = true
EOF
  colima ssh -p "$PROFILE" -- sudo systemctl restart containerd 2>/dev/null || true
  echo "  Done."
fi

echo ""

# ── Step 5: Wait for node and label ───────────────────────────────────

VM_HOSTNAME=$(colima ssh -p "$PROFILE" -- hostname 2>/dev/null || echo "colima-${PROFILE}")
echo "Waiting for node '${VM_HOSTNAME}' to join cluster..."

RETRIES=0
while [ $RETRIES -lt 30 ]; do
  if kubectl get node "$VM_HOSTNAME" &>/dev/null; then
    echo "  Node joined!"
    kubectl label node "$VM_HOSTNAME" "open-platform.sh/node-role=worker" --overwrite
    echo "  Labeled: open-platform.sh/node-role=worker"
    break
  fi
  sleep 5
  RETRIES=$((RETRIES + 1))
done

if [ $RETRIES -ge 30 ]; then
  echo "  Warning: Node did not appear within 150s."
  echo "  Check: kubectl get nodes"
  echo "  Logs:  colima ssh -p ${PROFILE} -- journalctl -u k3s-agent -f"
  exit 1
fi

echo ""
echo "=== Colima agent ready ==="
echo "  Node:    ${VM_HOSTNAME}"
echo "  Role:    worker"
echo "  Profile: ${PROFILE}"
echo ""
echo "  Stop:    colima stop ${PROFILE}"
echo "  Remove:  ./scripts/node-remove.sh ${VM_HOSTNAME}"
echo "  Status:  ./scripts/node-status.sh"
