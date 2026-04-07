#!/usr/bin/env bash
set -euo pipefail

# Joins agent node(s) to the k3s cluster.
# Usage: ./scripts/node-join.sh [node-name]
# Reads agent config from open-platform.yaml.
# Idempotent — skips already-joined nodes.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Load platform config
if [ -f "$ROOT_DIR/.env" ]; then
  set -a; source "$ROOT_DIR/.env"; set +a
fi

DOMAIN="${PLATFORM_DOMAIN:-}"
CONFIG_FILE="$ROOT_DIR/open-platform.yaml"

# Get server URL and token
get_server_info() {
  local TOKEN_FILE="/var/lib/rancher/k3s/server/node-token"
  if [ ! -f "$TOKEN_FILE" ]; then
    echo "Error: k3s server token not found at $TOKEN_FILE"
    echo "  This script must be run on the k3s server node."
    exit 1
  fi
  K3S_TOKEN=$(cat "$TOKEN_FILE")

  # Get the server's advertised IP
  SERVER_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}' \
    | tr ' ' '\n' | grep -E '^[0-9]+\.' | head -1)
  K3S_URL="https://${SERVER_IP}:6443"
}

# Check if node already joined
is_node_joined() {
  local name="$1"
  kubectl get node "$name" &>/dev/null
}

# Test connectivity from a remote host to the k3s server
test_connectivity() {
  local address="$1"
  local type="$2"

  echo "  Testing connectivity to ${K3S_URL}..."

  case "$type" in
    colima)
      local profile="${3:-}"
      if ! colima ssh -p "$profile" -- timeout 5 sh -c "echo > /dev/tcp/${SERVER_IP}/6443" 2>/dev/null; then
        echo "  Warning: Cannot reach ${SERVER_IP}:6443 from Colima VM."
        echo "  The VM may need routing to the server network."
        return 1
      fi
      ;;
    *)
      # For SSH-based nodes, test from the remote host
      if ! ssh -o ConnectTimeout=5 "${address}" "timeout 5 bash -c 'echo > /dev/tcp/${SERVER_IP}/6443'" 2>/dev/null; then
        echo "  Warning: Cannot reach ${SERVER_IP}:6443 from ${address}."
        return 1
      fi
      ;;
  esac
  echo "  Connectivity OK."
}

# Join a Colima node
join_colima() {
  local name="$1" profile="$2" role="$3"

  echo "Joining Colima node: ${name} (profile: ${profile})..."

  # Check if Colima VM is running
  if ! colima status "$profile" &>/dev/null; then
    echo "  Starting Colima VM..."
    colima start "$profile" --runtime containerd --network-address \
      --cpu "${OP_COLIMA_CPU:-4}" --memory "${OP_COLIMA_MEMORY:-8}" --disk "${OP_COLIMA_DISK:-50}"
  fi

  # Check if k3s agent is already running
  if colima ssh -p "$profile" -- pgrep k3s-agent &>/dev/null; then
    echo "  k3s agent already running."
  else
    # Install k3s agent
    echo "  Installing k3s agent..."
    colima ssh -p "$profile" -- sh -c \
      "curl -sfL https://get.k3s.io | K3S_URL='${K3S_URL}' K3S_TOKEN='${K3S_TOKEN}' INSTALL_K3S_EXEC='agent --flannel-external-ip' sh -"
  fi

  # Install CA cert if self-signed
  if [ -f "$ROOT_DIR/certs/ca.crt" ]; then
    echo "  Installing CA cert..."
    cat "$ROOT_DIR/certs/ca.crt" | colima ssh -p "$profile" -- sudo tee /usr/local/share/ca-certificates/openplatform.crt > /dev/null
    colima ssh -p "$profile" -- sudo update-ca-certificates 2>&1 | grep -v "^$" || true

    # Configure containerd registry
    colima ssh -p "$profile" -- sudo mkdir -p "/etc/containerd/certs.d/forgejo.${DOMAIN}" 2>/dev/null
    colima ssh -p "$profile" -- sudo tee "/etc/containerd/certs.d/forgejo.${DOMAIN}/hosts.toml" > /dev/null <<EOF
server = "https://forgejo.${DOMAIN}"

[host."https://forgejo.${DOMAIN}"]
  ca = "/usr/local/share/ca-certificates/openplatform.crt"
  skip_verify = true
EOF
    colima ssh -p "$profile" -- sudo systemctl restart containerd 2>/dev/null || true
  fi

  # Wait for node
  wait_for_node "$name" "$role"
}

# Join a generic node via SSH
join_generic() {
  local name="$1" address="$2" role="$3" ssh_user="${4:-root}"

  echo "Joining node: ${name} (${address})..."

  local SSH_TARGET="${ssh_user}@${address}"

  # Install k3s agent
  echo "  Installing k3s agent..."
  ssh "$SSH_TARGET" "curl -sfL https://get.k3s.io | K3S_URL='${K3S_URL}' K3S_TOKEN='${K3S_TOKEN}' INSTALL_K3S_EXEC='agent --flannel-external-ip' sh -"

  # Distribute CA cert
  if [ -f "$ROOT_DIR/certs/ca.crt" ]; then
    echo "  Installing CA cert..."
    scp "$ROOT_DIR/certs/ca.crt" "${SSH_TARGET}:/tmp/openplatform-ca.crt"
    ssh "$SSH_TARGET" "sudo cp /tmp/openplatform-ca.crt /usr/local/share/ca-certificates/ && sudo update-ca-certificates 2>/dev/null || true"
  fi

  wait_for_node "$name" "$role"
}

# Join a NixOS node
join_nixos() {
  local name="$1" address="$2" role="$3" ssh_user="${4:-root}"

  echo "Joining NixOS node: ${name} (${address})..."
  echo ""
  echo "  NixOS nodes use declarative configuration. Add these settings to your NixOS config:"
  echo ""
  echo "    services.open-platform = {"
  echo "      enable = true;"
  echo "      domain = \"${DOMAIN}\";"
  echo "      role = \"agent\";"
  echo "      serverAddr = \"${K3S_URL}\";"
  echo "      tokenFile = \"/var/lib/rancher/k3s/agent/token\";  # copy token to this path"
  echo "      flannel.externalIp = true;  # if cross-network"
  if [ -f "$ROOT_DIR/certs/ca.crt" ]; then
    echo "      registryCaFile = \"/etc/ssl/certs/openplatform-ca.crt\";  # copy CA to this path"
  fi
  echo "    };"
  echo ""
  echo "  Then: scp the token and CA cert, run nixos-rebuild switch."
  echo ""

  # Copy token to the node
  local SSH_TARGET="${ssh_user}@${address}"
  echo "  Copying join token..."
  ssh "$SSH_TARGET" "mkdir -p /var/lib/rancher/k3s/agent"
  echo "$K3S_TOKEN" | ssh "$SSH_TARGET" "cat > /var/lib/rancher/k3s/agent/token"

  if [ -f "$ROOT_DIR/certs/ca.crt" ]; then
    echo "  Copying CA cert..."
    scp "$ROOT_DIR/certs/ca.crt" "${SSH_TARGET}:/etc/ssl/certs/openplatform-ca.crt"
  fi

  echo "  Token and CA cert copied. Run 'nixos-rebuild switch' on ${name} to complete."
  echo ""

  # Don't wait — NixOS rebuild is manual
  return 0
}

# Wait for a node to appear and label it
wait_for_node() {
  local name="$1" role="$2"
  local retries=0

  echo "  Waiting for node ${name}..."
  while [ $retries -lt 30 ]; do
    if kubectl get node "$name" &>/dev/null; then
      echo "  Node ${name} joined."
      kubectl label node "$name" "open-platform.sh/node-role=${role}" --overwrite 2>/dev/null || true
      echo "  Labeled: open-platform.sh/node-role=${role}"
      return 0
    fi
    sleep 5
    retries=$((retries + 1))
  done

  echo "  Warning: Node ${name} did not appear within 150s."
  echo "  Check: kubectl get nodes"
}

# ── Main ─────────────────────────────────────────────────────────────────

get_server_info

TARGET_NODE="${1:-}"

# Simple config parser for nodes section
# Reads name, address, type, role from open-platform.yaml
parse_agents() {
  if [ ! -f "$CONFIG_FILE" ]; then
    echo "Error: open-platform.yaml not found."
    exit 1
  fi

  local in_agents=false
  local current_name="" current_address="" current_type="generic" current_role="worker" current_profile=""

  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" =~ ^[[:space:]]*$ ]] && continue

    local stripped="${line#"${line%%[![:space:]]*}"}"
    local indent=$(( ${#line} - ${#stripped} ))

    # Detect agents section
    if [[ "$stripped" == "agents:" ]]; then
      in_agents=true
      continue
    fi

    # Exit agents section on un-indent
    if $in_agents && (( indent <= 2 )) && [[ "$stripped" != "-"* ]]; then
      # Flush last entry
      if [ -n "$current_name" ]; then
        echo "${current_name}|${current_address}|${current_type}|${current_role}|${current_profile}"
      fi
      in_agents=false
      continue
    fi

    if $in_agents; then
      # New list item
      if [[ "$stripped" == "- "* ]]; then
        # Flush previous entry
        if [ -n "$current_name" ]; then
          echo "${current_name}|${current_address}|${current_type}|${current_role}|${current_profile}"
        fi
        current_name="" current_address="" current_type="generic" current_role="worker" current_profile=""
        stripped="${stripped#- }"
      fi

      if [[ "$stripped" =~ ^name:\ *(.+)$ ]]; then current_name="${BASH_REMATCH[1]}"; fi
      if [[ "$stripped" =~ ^address:\ *(.+)$ ]]; then current_address="${BASH_REMATCH[1]}"; fi
      if [[ "$stripped" =~ ^type:\ *(.+)$ ]]; then current_type="${BASH_REMATCH[1]}"; fi
      if [[ "$stripped" =~ ^role:\ *(.+)$ ]]; then current_role="${BASH_REMATCH[1]}"; fi
      if [[ "$stripped" =~ ^colima_profile:\ *(.+)$ ]]; then current_profile="${BASH_REMATCH[1]}"; fi
    fi
  done < "$CONFIG_FILE"

  # Flush last entry
  if $in_agents && [ -n "$current_name" ]; then
    echo "${current_name}|${current_address}|${current_type}|${current_role}|${current_profile}"
  fi
}

JOINED=0
while IFS='|' read -r name address type role profile; do
  # Skip if targeting specific node
  if [ -n "$TARGET_NODE" ] && [ "$name" != "$TARGET_NODE" ]; then
    continue
  fi

  # Skip if already joined
  if is_node_joined "$name"; then
    echo "Node ${name} already in cluster — skipping."
    kubectl label node "$name" "open-platform.sh/node-role=${role}" --overwrite 2>/dev/null || true
    JOINED=$((JOINED + 1))
    continue
  fi

  case "$type" in
    colima)
      join_colima "$name" "${profile:-$name}" "$role"
      ;;
    nixos)
      join_nixos "$name" "$address" "$role"
      ;;
    generic|*)
      join_generic "$name" "$address" "$role"
      ;;
  esac

  JOINED=$((JOINED + 1))
done < <(parse_agents)

if [ $JOINED -eq 0 ]; then
  if [ -n "$TARGET_NODE" ]; then
    echo "Node '${TARGET_NODE}' not found in open-platform.yaml"
  else
    echo "No agents configured in open-platform.yaml"
    echo ""
    echo "Add agents to open-platform.yaml:"
    echo "  nodes:"
    echo "    agents:"
    echo "      - name: worker-1"
    echo "        address: 192.168.64.7"
    echo "        type: colima"
    echo "        role: worker"
  fi
  exit 1
fi

echo ""
echo "Done. Run 'kubectl get nodes' to verify."
