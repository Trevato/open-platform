#!/usr/bin/env bash
# sync-registry.sh — Update k3s registries.yaml on server nodes with current CA + credentials
# Run after `make deploy` to ensure nodes can pull images from the Forgejo registry.
# k3s auto-reloads registries.yaml — no restart required.

set -euo pipefail

DOMAIN=$(grep '^domain:' open-platform.yaml 2>/dev/null | awk '{print $2}' | tr -d "\"'" || echo "")
ADMIN_USER=$(grep -A2 '^admin:' open-platform.yaml 2>/dev/null | grep 'username:' | awk '{print $2}' | tr -d "\"'" || echo "opadmin")

if [ -z "$DOMAIN" ]; then
  echo "Error: Could not read domain from open-platform.yaml"
  exit 1
fi

echo "Syncing registry credentials for ${DOMAIN}..."

# Extract CA cert and admin password from cluster
CA_CERT=$(kubectl get configmap platform-ca -n kube-system -o jsonpath='{.data.ca\.crt}' 2>/dev/null || echo "")
ADMIN_PASS=$(kubectl get secret forgejo-admin-credentials -n forgejo -o jsonpath='{.data.password}' 2>/dev/null | base64 -d || echo "")

if [ -z "$CA_CERT" ]; then
  echo "Warning: No platform CA found in cluster — registry may use public TLS."
fi

if [ -z "$ADMIN_PASS" ]; then
  echo "Error: Could not read admin password from cluster."
  exit 1
fi

# Determine target nodes — server node hostnames from kubectl
SERVER_NODES=$(kubectl get nodes -l node-role.kubernetes.io/control-plane -o jsonpath='{.items[*].status.addresses[?(@.type=="Hostname")].address}' 2>/dev/null)
if [ -z "$SERVER_NODES" ]; then
  SERVER_NODES=$(kubectl get nodes -l node-role.kubernetes.io/master -o jsonpath='{.items[*].status.addresses[?(@.type=="Hostname")].address}' 2>/dev/null)
fi

# Fall back to first argument or SSH_HOST env var
TARGET="${1:-${SSH_HOST:-}}"
if [ -z "$TARGET" ] && [ -z "$SERVER_NODES" ]; then
  echo "Error: No server nodes found. Pass target host as argument: ./scripts/sync-registry.sh <host>"
  exit 1
fi

TARGETS="${TARGET:-$SERVER_NODES}"

# Generate registries.yaml content
REGISTRIES_YAML="mirrors:
  forgejo.${DOMAIN}:
    endpoint:
      - \"https://forgejo.${DOMAIN}\"
configs:
  \"forgejo.${DOMAIN}\":
    auth:
      username: \"${ADMIN_USER}\"
      password: \"${ADMIN_PASS}\""

if [ -n "$CA_CERT" ]; then
  REGISTRIES_YAML="${REGISTRIES_YAML}
    tls:
      ca_file: \"/etc/rancher/k3s/certs/open-platform-ca.crt\""
fi

for host in $TARGETS; do
  echo "  Updating ${host}..."

  # Write CA cert
  if [ -n "$CA_CERT" ]; then
    echo "$CA_CERT" | ssh "$host" "sudo mkdir -p /etc/rancher/k3s/certs && sudo tee /etc/rancher/k3s/certs/open-platform-ca.crt > /dev/null"
  fi

  # Write registries.yaml
  echo "$REGISTRIES_YAML" | ssh "$host" "sudo tee /etc/rancher/k3s/registries.yaml > /dev/null"

  echo "  ${host} updated."
done

echo "Registry sync complete."
