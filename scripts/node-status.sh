#!/usr/bin/env bash
set -euo pipefail

# Shows cluster node status and workload distribution.
# Usage: ./scripts/node-status.sh

echo "=== Cluster Nodes ==="
echo ""

# Node summary — show actual Ready status, not just condition type
kubectl get nodes -o wide --no-headers 2>/dev/null | while read -r name status roles age version ip _ os kernel runtime; do
  role=$(kubectl get node "$name" -o jsonpath='{.metadata.labels.open-platform\.sh/node-role}' 2>/dev/null || echo "—")
  sched=$(kubectl get node "$name" -o jsonpath='{.spec.unschedulable}' 2>/dev/null)
  [ "$role" = "" ] && role="—"
  [ "$sched" = "true" ] && sched="cordoned" || sched="—"
  printf "%-20s %-10s %-10s %-10s %-16s %s\n" "$name" "$status" "$role" "$sched" "$version" "$ip"
done | (printf "%-20s %-10s %-10s %-10s %-16s %s\n" "NAME" "STATUS" "ROLE" "SCHED" "VERSION" "IP"; cat)

echo ""
echo "=== Pod Distribution ==="
echo ""

# Pods per node
kubectl get pods -A -o custom-columns='NODE:.spec.nodeName' --no-headers 2>/dev/null \
  | sort | uniq -c | sort -rn | while read -r count node; do
    printf "  %-30s %d pods\n" "$node" "$count"
  done

echo ""
echo "=== Resource Usage ==="
echo ""

# Resource usage (requires metrics-server)
if kubectl top nodes 2>/dev/null; then
  true
else
  echo "  (metrics-server not available — install for resource usage data)"
fi

echo ""
echo "=== Stateful Services ==="
echo ""

# Show which node each stateful service is on
for ns in postgres minio forgejo woodpecker zulip jitsi; do
  POD_NODE=$(kubectl get pods -n "$ns" -o jsonpath='{.items[0].spec.nodeName}' 2>/dev/null || echo "—")
  POD_STATUS=$(kubectl get pods -n "$ns" -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo "—")
  printf "  %-15s node: %-25s status: %s\n" "$ns" "$POD_NODE" "$POD_STATUS"
done
