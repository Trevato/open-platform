#!/usr/bin/env bash
set -euo pipefail

# Starts Colima and joins the Mac as a k3s agent to the VxRail control plane.
# First run: installs k3s agent. Subsequent runs: just starts Colima + agent.

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
for VAR in K3S_SERVER K3S_TOKEN NODE_EXTERNAL_IP; do
  if [ -z "${!VAR:-}" ]; then
    echo "Error: ${VAR} not set in .env"
    exit 1
  fi
done

# Start Colima VM without built-in kubernetes
if ! colima status 2>/dev/null | grep -q Running; then
  echo "Starting Colima VM..."
  colima start --cpu 6 --memory 12 --disk 100
else
  echo "Colima already running."
fi

# Verify connectivity to VxRail
VXRAIL_IP=$(echo "$K3S_SERVER" | sed 's|https://||; s|:.*||')
echo "Testing connectivity to VxRail control plane..."
if ! colima ssh -- ping -c 1 -W 3 "$VXRAIL_IP" >/dev/null 2>&1; then
  echo "Error: Colima VM cannot reach VxRail at ${VXRAIL_IP}"
  echo "Ensure Tailscale is running and IP forwarding is enabled:"
  echo "  sudo sysctl -w net.inet.ip.forwarding=1"
  exit 1
fi

# Install k3s agent if not already installed
if colima ssh -- systemctl is-active k3s-agent >/dev/null 2>&1; then
  echo "k3s agent already running."
else
  echo "Installing k3s agent..."
  colima ssh -- sh -c "
    curl -sfL https://get.k3s.io | \
      K3S_URL='${K3S_SERVER}' \
      K3S_TOKEN='${K3S_TOKEN}' \
      INSTALL_K3S_EXEC='agent --node-external-ip=${NODE_EXTERNAL_IP}' \
      sh -
  "
fi

# Install CA cert for Forgejo registry
echo "Ensuring CA cert for container registry..."
colima ssh -- sudo mkdir -p /etc/rancher/k3s /etc/docker/certs.d/forgejo.dev.test
if [ -f "${ROOT_DIR}/certs/ca.crt" ]; then
  colima ssh -- sudo tee /etc/docker/certs.d/forgejo.dev.test/ca.crt < "${ROOT_DIR}/certs/ca.crt" >/dev/null
fi

# Create registries.yaml for self-signed registry
colima ssh -- sudo tee /etc/rancher/k3s/registries.yaml >/dev/null <<'YAML'
mirrors:
  forgejo.dev.test:
    endpoint:
      - "https://forgejo.dev.test"
configs:
  "forgejo.dev.test":
    tls:
      insecure_skip_verify: true
YAML

# Wait for node to join
echo "Waiting for Mac to join cluster..."
for i in $(seq 1 30); do
  if kubectl get node colima >/dev/null 2>&1; then
    echo "Mac joined cluster as agent."
    kubectl uncordon colima 2>/dev/null || true
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "Warning: Mac took too long to join cluster."
    exit 1
  fi
  sleep 2
done

echo ""
kubectl get nodes -o wide
echo ""
echo "Mac is online as a k3s agent."
