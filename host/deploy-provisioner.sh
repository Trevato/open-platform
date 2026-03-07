#!/usr/bin/env bash
set -euo pipefail

# Deploys the provisioner CronJob to the HOST k3s cluster.
# Creates namespace, secrets, ConfigMaps, pushes deploy-bundle repo, applies CronJob.
# Idempotent — safe to re-run.
#
# Prerequisites:
#   - kubeconfig pointing to the host k3s cluster
#   - ops vCluster (vc-open-platform-sh) running with Forgejo + PostgreSQL

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

FORGEJO_SVC="forgejo-http-x-forgejo-x-open-platform-sh"
FORGEJO_NS="vc-open-platform-sh"
FORGEJO_SECRET="forgejo-admin-credentials-x-forgejo-x-open-platform-sh"
POSTGRES_SVC="postgres-rw-x-postgres-x-open-platform-sh"

PROVISIONER_NS="provisioner"
LOCAL_PORT=13000

# ── Read Forgejo admin credentials from synced secret ────────────────────────

echo "Reading Forgejo admin credentials from synced secret..."
ADMIN_USER=$(kubectl get secret "$FORGEJO_SECRET" -n "$FORGEJO_NS" \
  -o jsonpath='{.data.username}' | base64 -d)
ADMIN_PASS=$(kubectl get secret "$FORGEJO_SECRET" -n "$FORGEJO_NS" \
  -o jsonpath='{.data.password}' | base64 -d)
echo "  User: ${ADMIN_USER}"

# ── Create provisioner namespace ─────────────────────────────────────────────

echo "Creating provisioner namespace..."
kubectl create namespace "$PROVISIONER_NS" --dry-run=client -o yaml | kubectl apply -f -

# ── Start port-forward to Forgejo ────────────────────────────────────────────

# Kill any existing port-forward on this port
pkill -f "port-forward.*${LOCAL_PORT}" 2>/dev/null || true
sleep 1

echo "Starting port-forward to Forgejo (${LOCAL_PORT}:3000)..."
kubectl port-forward -n "$FORGEJO_NS" "svc/${FORGEJO_SVC}" "${LOCAL_PORT}:3000" &>/dev/null &
PF_PID=$!

cleanup() {
  kill "$PF_PID" 2>/dev/null || true
  rm -f "${SCRIPT_DIR}/.git-askpass-provisioner"
}
trap cleanup EXIT
sleep 3

# Verify port-forward
if ! curl -sf "http://localhost:${LOCAL_PORT}/api/v1/version" >/dev/null 2>&1; then
  echo "ERROR: Cannot reach Forgejo via port-forward"
  exit 1
fi
echo "  Port-forward established"

API_URL="http://localhost:${LOCAL_PORT}/api/v1"

api() {
  curl -fsSk -u "${ADMIN_USER}:${ADMIN_PASS}" "$@"
}

# ── Create deploy-bundle repo on Forgejo ─────────────────────────────────────

echo "Creating system/deploy-bundle repo..."

# Ensure system org exists
if ! api "${API_URL}/orgs/system" >/dev/null 2>&1; then
  echo "ERROR: system org does not exist on Forgejo"
  exit 1
fi

# Create repo if it doesn't exist
if api "${API_URL}/repos/system/deploy-bundle" >/dev/null 2>&1; then
  echo "  Repo already exists"
else
  api -X POST "${API_URL}/orgs/system/repos" \
    -H "Content-Type: application/json" \
    -d '{"name": "deploy-bundle", "description": "Full platform codebase for provisioner", "auto_init": false, "private": true}' >/dev/null
  echo "  Repo created"
fi

# Push full repo content (always force-push to keep up to date)
echo "Pushing repo content to system/deploy-bundle..."

TMP_DIR=$(mktemp -d)
PUSH_CLEANUP() {
  rm -rf "$TMP_DIR"
  cleanup
}
trap PUSH_CLEANUP EXIT

# Copy content needed for provisioning
for dir in scripts config host templates apps manifests; do
  if [ -d "${ROOT_DIR}/${dir}" ]; then
    cp -r "${ROOT_DIR}/${dir}" "${TMP_DIR}/"
  fi
done

# Copy essential root files
for f in Makefile helmfile.yaml open-platform.yaml.example; do
  [ -f "${ROOT_DIR}/${f}" ] && cp "${ROOT_DIR}/${f}" "${TMP_DIR}/" 2>/dev/null || true
done

# Clean build artifacts and secrets
find "$TMP_DIR" -name "node_modules" -type d -exec rm -rf {} + 2>/dev/null || true
find "$TMP_DIR" -name ".next" -type d -exec rm -rf {} + 2>/dev/null || true
find "$TMP_DIR" -name "bun.lock" -delete 2>/dev/null || true
find "$TMP_DIR" -name "tsconfig.tsbuildinfo" -delete 2>/dev/null || true
rm -f "$TMP_DIR/.env" "$TMP_DIR/open-platform.state.yaml"

# Git askpass helper
cat > "${SCRIPT_DIR}/.git-askpass-provisioner" <<'ASKPASS'
#!/bin/sh
case "$1" in
  *Username*|*username*) echo "$GIT_USERNAME" ;;
  *Password*|*password*) echo "$GIT_PASSWORD" ;;
esac
ASKPASS
chmod +x "${SCRIPT_DIR}/.git-askpass-provisioner"

cd "$TMP_DIR"
git init -q
git checkout -b main
git add .
git -c user.name="Open Platform" -c user.email="system@open-platform.sh" \
  commit -q -m "Deploy bundle $(date -u +%Y-%m-%dT%H:%M:%SZ)"

GIT_ASKPASS="${SCRIPT_DIR}/.git-askpass-provisioner" \
GIT_USERNAME="${ADMIN_USER}" \
GIT_PASSWORD="${ADMIN_PASS}" \
  git push -q --force "http://localhost:${LOCAL_PORT}/system/deploy-bundle.git" main 2>/dev/null

cd "$ROOT_DIR"
echo "  Content pushed"

# ── Create secrets ───────────────────────────────────────────────────────────

echo "Creating provisioner secrets..."

# DB connection secret
POSTGRES_HOST="${POSTGRES_SVC}.${FORGEJO_NS}.svc.cluster.local"
kubectl create secret generic provisioner-db -n "$PROVISIONER_NS" \
  --from-literal=host="${POSTGRES_HOST}" \
  --from-literal=port="5432" \
  --from-literal=username="op_system_console" \
  --from-literal=password="op_system_console" \
  --from-literal=database="op_system_console" \
  --dry-run=client -o yaml | kubectl apply -f -
echo "  provisioner-db"

# Forgejo credentials secret
kubectl create secret generic provisioner-forgejo -n "$PROVISIONER_NS" \
  --from-literal=username="${ADMIN_USER}" \
  --from-literal=password="${ADMIN_PASS}" \
  --dry-run=client -o yaml | kubectl apply -f -
echo "  provisioner-forgejo"

# ── Create ConfigMap from provisioner scripts ────────────────────────────────

echo "Creating provisioner-scripts ConfigMap..."
kubectl create configmap provisioner-scripts -n "$PROVISIONER_NS" \
  --from-file=reconciler.sh="${SCRIPT_DIR}/provisioner/reconciler.sh" \
  --from-file=health-check.sh="${SCRIPT_DIR}/provisioner/health-check.sh" \
  --dry-run=client -o yaml | kubectl apply -f -
echo "  provisioner-scripts"

# ── Apply CronJob manifest ──────────────────────────────────────────────────

echo "Applying CronJob manifest..."
kubectl apply -f "${SCRIPT_DIR}/provisioner/cronjob.yaml"

echo ""
echo "=== Provisioner Deployed ==="
echo ""
echo "  Namespace:  ${PROVISIONER_NS}"
echo "  DB Host:    ${POSTGRES_HOST}"
echo "  Reconciler: every 1 minute"
echo "  Health:     every 5 minutes"
echo ""
echo "Monitor with:"
echo "  kubectl get jobs -n ${PROVISIONER_NS} -w"
echo "  kubectl logs -n ${PROVISIONER_NS} -l component=reconciler -f"
