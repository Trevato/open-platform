#!/bin/bash
set -euo pipefail

# Local dev launcher — port-forwards postgres + forgejo, then runs bun --watch
# Usage: bash scripts/dev.sh

cleanup() {
  echo "Stopping port-forwards..."
  kill %1 %2 2>/dev/null || true
}
trap cleanup EXIT

echo "Starting port-forwards..."
kubectl port-forward -n postgres svc/postgres-rw 5432:5432 &
kubectl port-forward -n forgejo svc/forgejo-http 3001:3000 &

sleep 2
echo "Starting dev server..."
bun --watch src/index.ts
