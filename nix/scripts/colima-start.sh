#!/usr/bin/env bash
set -euo pipefail

PROFILE="op"
CPU="${OP_COLIMA_CPU:-4}"
MEMORY="${OP_COLIMA_MEMORY:-8}"
DISK="${OP_COLIMA_DISK:-50}"

if [ "${1:-}" = "--delete-first" ]; then
  echo "Deleting existing Colima profile '$PROFILE'..."
  colima delete "$PROFILE" --force 2>/dev/null || true
  rm -rf "$HOME/.colima/_lima/_disks/colima-${PROFILE}"
  shift
fi

if colima status "$PROFILE" 2>/dev/null | grep -q Running; then
  echo "Colima '$PROFILE' is already running."
  exit 0
fi

echo "Starting Colima '$PROFILE' (${CPU} CPU, ${MEMORY}GB RAM, ${DISK}GB disk)..."
colima start "$PROFILE" \
  --kubernetes \
  --cpu "$CPU" \
  --memory "$MEMORY" \
  --disk "$DISK" \
  --runtime containerd \
  --network-address

echo ""
echo "Colima '$PROFILE' started."
echo "  kubectl context: colima-${PROFILE}"
echo ""
echo "Next steps:"
echo "  1. kubectl config use-context colima-${PROFILE}"
echo "  2. cp nix/examples/open-platform-dev.yaml open-platform.yaml"
echo "  3. make deploy"
