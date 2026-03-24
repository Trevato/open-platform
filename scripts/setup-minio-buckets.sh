#!/usr/bin/env bash
set -euo pipefail

# Creates MinIO buckets required by platform services.
# Idempotent — safe to run on every deploy.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$ROOT_DIR/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "Error: .env not found."
  exit 1
fi

# shellcheck source=/dev/null
source "$ENV_FILE"

echo "Ensuring MinIO buckets..."

MINIO_LOCAL_PORT=9199
kubectl port-forward -n minio svc/minio ${MINIO_LOCAL_PORT}:9000 &
PF_PID=$!
trap "kill $PF_PID 2>/dev/null || true" EXIT

# Wait for port-forward
for i in $(seq 1 15); do
  if curl -sf "http://localhost:${MINIO_LOCAL_PORT}/minio/health/live" >/dev/null 2>&1; then
    break
  fi
  if [ "$i" -eq 15 ]; then
    echo "Warning: MinIO not responding after 15 attempts. Skipping bucket creation."
    exit 0
  fi
  sleep 2
done

create_bucket() {
  local bucket="$1"
  local status
  status=$(curl -sf -o /dev/null -w "%{http_code}" \
    -u "${MINIO_ROOT_USER}:${MINIO_ROOT_PASSWORD}" \
    -X PUT "http://localhost:${MINIO_LOCAL_PORT}/${bucket}" 2>/dev/null || echo "000")

  case "$status" in
    200) echo "  Created bucket: ${bucket}" ;;
    409) echo "  Bucket already exists: ${bucket}" ;;
    *)   echo "  Warning: bucket ${bucket} creation returned ${status}" ;;
  esac
}

create_bucket "forgejo-packages"

echo "MinIO buckets ready."
