#!/usr/bin/env bash
set -euo pipefail

# Creates Flux bootstrap resources: git credentials, GitRepository, and
# root Kustomization pointing to system/open-platform on Forgejo.
# Idempotent — uses kubectl apply for all resources.
# Runs as a flux postsync hook after Flux controllers are installed.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
CA_CERT="${ROOT_DIR}/certs/ca.crt"

ADMIN_USER=$(kubectl get secret forgejo-admin-credentials -n forgejo -o jsonpath='{.data.username}' | base64 -d)
ADMIN_PASS=$(kubectl get secret forgejo-admin-credentials -n forgejo -o jsonpath='{.data.password}' | base64 -d)
CA_CERT_DATA=$(base64 < "${CA_CERT}")

echo "Creating Flux git credentials..."

kubectl apply -f - <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: forgejo-auth
  namespace: flux-system
type: Opaque
stringData:
  username: "${ADMIN_USER}"
  password: "${ADMIN_PASS}"
data:
  ca.crt: "${CA_CERT_DATA}"
EOF

echo "Creating Flux GitRepository for system/open-platform..."

kubectl apply -f - <<'EOF'
apiVersion: source.toolkit.fluxcd.io/v1
kind: GitRepository
metadata:
  name: open-platform
  namespace: flux-system
spec:
  interval: 1m
  url: https://forgejo.dev.test/system/open-platform.git
  ref:
    branch: main
  secretRef:
    name: forgejo-auth
EOF

echo "Creating Flux root Kustomization..."

kubectl apply -f - <<'EOF'
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: open-platform
  namespace: flux-system
spec:
  interval: 5m
  retryInterval: 1m
  timeout: 10m
  sourceRef:
    kind: GitRepository
    name: open-platform
  path: ./platform
  prune: true
  wait: true
EOF

echo "Waiting for Flux to reconcile..."

# Wait for the root Kustomization to become ready
if kubectl wait kustomization/open-platform -n flux-system --for=condition=Ready --timeout=300s 2>/dev/null; then
  echo "Flux reconciliation complete — platform is self-managing."
else
  echo "Warning: Flux reconciliation still in progress. Check: kubectl get kustomizations -n flux-system"
fi

echo "Flux bootstrap complete."
