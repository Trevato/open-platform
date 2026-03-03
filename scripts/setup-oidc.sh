#!/usr/bin/env bash
set -euo pipefail

# Updates the k3s API server OIDC config with the current Headlamp client ID.
# Idempotent — skips if already correct.
# Requires Colima VM access.

CLIENT_ID=$(kubectl get secret oidc -n headlamp -o jsonpath='{.data.OIDC_CLIENT_ID}' 2>/dev/null | base64 -d 2>/dev/null || echo "")

if [ -z "$CLIENT_ID" ]; then
  echo "Warning: Headlamp OIDC secret not found — skipping k3s OIDC config."
  exit 0
fi

# Check current k3s config
CURRENT=$(colima ssh -- sudo grep 'oidc-client-id=' /etc/rancher/k3s/config.yaml 2>/dev/null | sed 's/.*oidc-client-id=//' | tr -d '"' || echo "")

if [ "$CURRENT" = "$CLIENT_ID" ]; then
  echo "k3s OIDC client ID already correct."
  exit 0
fi

echo "Updating k3s OIDC client ID: ${CLIENT_ID}"
colima ssh -- sudo sed -i "s/oidc-client-id=.*/oidc-client-id=${CLIENT_ID}\"/" /etc/rancher/k3s/config.yaml

echo "Restarting k3s..."
colima ssh -- sudo systemctl restart k3s

# Wait for k3s to come back
echo "Waiting for k3s..."
for i in $(seq 1 30); do
  if kubectl get nodes >/dev/null 2>&1; then
    echo "k3s is ready."
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "Warning: k3s took too long to restart."
    exit 1
  fi
  sleep 2
done

echo "Headlamp OIDC configured."
