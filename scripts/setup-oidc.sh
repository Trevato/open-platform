#!/usr/bin/env bash
set -euo pipefail

# Updates the k3s API server OIDC config with the current Headlamp client ID.
# Supports both VxRail (NixOS, SSH) and Colima (local VM) environments.
# Idempotent — skips if already correct.

CLIENT_ID=$(kubectl get secret oidc -n headlamp -o jsonpath='{.data.OIDC_CLIENT_ID}' 2>/dev/null | base64 -d 2>/dev/null || echo "")

if [ -z "$CLIENT_ID" ]; then
  echo "Warning: Headlamp OIDC secret not found — skipping k3s OIDC config."
  exit 0
fi

# Detect environment: VxRail (remote SSH) or Colima (local VM)
NODE_NAME=$(kubectl get nodes -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")

if [ "$NODE_NAME" = "otavert-vxrail" ]; then
  echo "VxRail detected — OIDC is configured via NixOS k3s extraFlags."
  echo "To enable OIDC, add these flags to ~/nix-darwin-config/modules/nixos.nix on VxRail:"
  echo "  \"--kube-apiserver-arg=oidc-issuer-url=https://forgejo.product-garden.com\""
  echo "  \"--kube-apiserver-arg=oidc-client-id=${CLIENT_ID}\""
  echo "  \"--kube-apiserver-arg=oidc-username-claim=preferred_username\""
  echo "  \"--kube-apiserver-arg=oidc-username-prefix=-\""
  echo "  \"--kube-apiserver-arg=oidc-groups-claim=groups\""
  echo "Then run: ssh vxrail 'sudo nixos-rebuild switch --flake ~/nix-darwin-config#otavert-vxrail'"
  echo "Skipping automatic configuration for now."
  exit 0
elif command -v colima &>/dev/null && colima status 2>/dev/null | grep -q Running; then
  # Colima path (original behavior)
  CURRENT=$(colima ssh -- sudo grep 'oidc-client-id=' /etc/rancher/k3s/config.yaml 2>/dev/null | sed 's/.*oidc-client-id=//' | tr -d '"' || echo "")

  if [ "$CURRENT" = "$CLIENT_ID" ]; then
    echo "k3s OIDC client ID already correct."
    exit 0
  fi

  echo "Updating k3s OIDC client ID: ${CLIENT_ID}"
  colima ssh -- sudo sed -i "s/oidc-client-id=.*/oidc-client-id=${CLIENT_ID}\"/" /etc/rancher/k3s/config.yaml

  echo "Restarting k3s..."
  colima ssh -- sudo systemctl restart k3s

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
else
  echo "Warning: Neither VxRail nor running Colima detected — skipping OIDC config."
  exit 0
fi
