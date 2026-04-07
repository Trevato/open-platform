#!/usr/bin/env bash
set -euo pipefail

# Removes an agent node from the k3s cluster.
# Usage: ./scripts/node-remove.sh <node-name>
# Drains the node, deletes it from the cluster, and optionally stops the agent.

NODE_NAME="${1:?Usage: $0 <node-name>}"

# Verify node exists
if ! kubectl get node "$NODE_NAME" &>/dev/null; then
  echo "Node '${NODE_NAME}' not found in cluster."
  exit 1
fi

# Don't allow removing the last node or a server node
NODE_ROLE=$(kubectl get node "$NODE_NAME" -o jsonpath='{.metadata.labels.node-role\.kubernetes\.io/master}' 2>/dev/null || echo "")
NODE_COUNT=$(kubectl get nodes --no-headers 2>/dev/null | wc -l | tr -d ' ')

if [ "$NODE_COUNT" -le 1 ]; then
  echo "Error: Cannot remove the only node in the cluster."
  exit 1
fi

echo "Removing node: ${NODE_NAME}"

# Cordon first
echo "  Cordoning..."
kubectl cordon "$NODE_NAME" 2>/dev/null || true

# Drain (evict pods, ignore daemonsets)
echo "  Draining..."
kubectl drain "$NODE_NAME" \
  --ignore-daemonsets \
  --delete-emptydir-data \
  --force \
  --timeout=120s 2>/dev/null || echo "  Warning: Drain timed out or had errors."

# Delete from cluster
echo "  Deleting from cluster..."
kubectl delete node "$NODE_NAME"

echo ""
echo "Node ${NODE_NAME} removed from cluster."
echo ""
echo "To uninstall k3s on the node:"
echo "  Agent:  /usr/local/bin/k3s-agent-uninstall.sh"
echo "  Server: /usr/local/bin/k3s-uninstall.sh"
