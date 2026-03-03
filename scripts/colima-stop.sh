#!/usr/bin/env bash
set -euo pipefail

# Gracefully drains the Mac node and stops Colima.
# All pods reschedule to VxRail within ~30 seconds.

NODE_NAME="colima"

if ! colima status 2>/dev/null | grep -q Running; then
  echo "Colima is not running."
  exit 0
fi

# Drain the Mac node — evicts all pods to VxRail
echo "Draining Mac node..."
if kubectl get node "$NODE_NAME" >/dev/null 2>&1; then
  kubectl drain "$NODE_NAME" \
    --ignore-daemonsets \
    --delete-emptydir-data \
    --grace-period=30 \
    --timeout=60s 2>&1 || echo "Warning: drain had issues, proceeding with stop"
fi

echo "Stopping Colima..."
colima stop

echo ""
echo "Mac disconnected. All workloads running on VxRail."
kubectl get nodes 2>/dev/null || true
