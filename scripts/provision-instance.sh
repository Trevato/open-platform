#!/usr/bin/env bash
set -euo pipefail

# Provisions a new customer vCluster instance on the host k3s cluster.
# Installs vCluster, bootstraps open-platform inside it via port-forward.
# Idempotent — safe to re-run on a partially provisioned instance.
#
# Usage: provision-instance.sh <slug> <tier> <admin_username> <admin_email> [instance_id]

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_FILE="/tmp/provision-${1:-unknown}.log"

# Save DB connection for event logging (inherited from reconciler CronJob).
# Must capture before any .env sourcing overwrites PG* vars.
_PROV_PGHOST="${PGHOST:-}"
_PROV_PGPORT="${PGPORT:-}"
_PROV_PGUSER="${PGUSER:-}"
_PROV_PGPASSWORD="${PGPASSWORD:-}"
_PROV_PGDATABASE="${PGDATABASE:-}"

# ── Structured Logging ───────────────────────────────────────────────────────

log_event() {
  local phase="$1" status="$2" message="$3"
  local ts
  ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  local entry="{\"phase\": \"${phase}\", \"status\": \"${status}\", \"message\": \"${message}\", \"ts\": \"${ts}\"}"
  echo "$entry" >> "$LOG_FILE"
  if [ "$status" = "error" ]; then
    echo "ERROR [${phase}] ${message}" >&2
  else
    echo "[${phase}] ${message}"
  fi

  # Write directly to console DB for realtime event streaming
  if [ -n "${INSTANCE_ID:-}" ] && [ -n "$_PROV_PGHOST" ] && command -v psql >/dev/null 2>&1; then
    local escaped_msg="${message//\'/\'\'}"
    PGHOST="$_PROV_PGHOST" PGPORT="$_PROV_PGPORT" PGUSER="$_PROV_PGUSER" \
    PGPASSWORD="$_PROV_PGPASSWORD" PGDATABASE="$_PROV_PGDATABASE" \
      psql -tAc "INSERT INTO provision_events (instance_id, phase, status, message, created_at) VALUES ('${INSTANCE_ID}', '${phase}', '${status}', '${escaped_msg}', '${ts}')" 2>/dev/null || true
  fi
}

# ── Argument Validation ──────────────────────────────────────────────────────

if [ $# -lt 4 ]; then
  echo "Usage: provision-instance.sh <slug> <tier> <admin_username> <admin_email>"
  echo ""
  echo "  slug           Instance identifier (alphanumeric + hyphens, 3-32 chars)"
  echo "  tier           Resource tier: free, pro, or team"
  echo "  admin_username Admin username for the instance"
  echo "  admin_email    Admin email for the instance"
  exit 1
fi

SLUG="$1"
TIER="$2"
ADMIN_USERNAME="$3"
ADMIN_EMAIL="$4"
INSTANCE_ID="${5:-}"

# Validate slug: alphanumeric + hyphens, 3-32 chars, no leading/trailing hyphens
if ! echo "$SLUG" | grep -Eq '^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$'; then
  echo "Error: slug must be 3-32 lowercase alphanumeric characters or hyphens (no leading/trailing hyphens)."
  exit 1
fi

# Validate tier
case "$TIER" in
  free|pro|team) ;;
  *)
    echo "Error: tier must be one of: free, pro, team"
    exit 1
    ;;
esac

# Validate admin username is not a Forgejo reserved name
RESERVED_NAMES="admin api assets attachments avatars captcha commits debug error explore favicon ghost issues labels login lfs milestones notifications org raw repo search stars template topics user"
for reserved in $RESERVED_NAMES; do
  if [ "$ADMIN_USERNAME" = "$reserved" ]; then
    echo "Error: '${ADMIN_USERNAME}' is a reserved username. Choose a different admin_username."
    exit 1
  fi
done

# Initialize log
echo "[]" > /dev/null  # ensure clean start
: > "$LOG_FILE"
log_event "init" "ok" "Provisioning ${SLUG} (tier=${TIER}, admin=${ADMIN_USERNAME})"

# ── Load Host Environment ────────────────────────────────────────────────────

ENV_FILE="${ROOT_DIR}/.env"
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck source=/dev/null
  source "$ENV_FILE"
  set +a
fi

DOMAIN="${PLATFORM_DOMAIN:-open-platform.sh}"
NAMESPACE="vc-${SLUG}"
VCLUSTER_VALUES="${ROOT_DIR}/host/vcluster-values.yaml"
if [ ! -f "$VCLUSTER_VALUES" ]; then
  VCLUSTER_VALUES="/config/vcluster-values.yaml"
fi

# ── Tier-Based Resource Limits ───────────────────────────────────────────────

case "$TIER" in
  free)
    CPU_LIMIT="500m"
    MEM_LIMIT="2Gi"
    STORAGE_LIMIT="10Gi"
    ;;
  pro)
    CPU_LIMIT="2"
    MEM_LIMIT="8Gi"
    STORAGE_LIMIT="50Gi"
    ;;
  team)
    CPU_LIMIT="4"
    MEM_LIMIT="16Gi"
    STORAGE_LIMIT="100Gi"
    ;;
esac

log_event "config" "ok" "Resources: cpu=${CPU_LIMIT}, memory=${MEM_LIMIT}, storage=${STORAGE_LIMIT}"

# ── Cleanup on exit ──────────────────────────────────────────────────────────

WORK_DIR=""

cleanup() {
  if [ -n "$WORK_DIR" ] && [ -d "$WORK_DIR" ]; then
    rm -rf "$WORK_DIR"
  fi
}
trap cleanup EXIT

# ── vCluster API Connectivity ────────────────────────────────────────────────
# After helm upgrades (pod restarts), wait for the vCluster API to be reachable
# via in-cluster service DNS. No port-forward needed.

ensure_vcluster_api() {
  # Quick check — already reachable?
  if KUBECONFIG="$VCLUSTER_KUBECONFIG" kubectl get namespaces --request-timeout=5s >/dev/null 2>&1; then
    return 0
  fi

  log_event "connectivity" "ok" "Waiting for vCluster API to become reachable"

  for attempt in $(seq 1 30); do
    if KUBECONFIG="$VCLUSTER_KUBECONFIG" kubectl get namespaces --request-timeout=5s >/dev/null 2>&1; then
      log_event "connectivity" "ok" "vCluster API reachable"
      return 0
    fi
    sleep 3
  done

  log_event "connectivity" "error" "Cannot reach vCluster API after 90s"
  return 1
}

# ── Phase 1: Create Namespace ────────────────────────────────────────────────

log_event "namespace" "ok" "Creating namespace ${NAMESPACE}"

kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -

kubectl label namespace "$NAMESPACE" \
  "open-platform.sh/managed=true" \
  "open-platform.sh/tier=${TIER}" \
  "open-platform.sh/slug=${SLUG}" \
  --overwrite

log_event "namespace" "ok" "Namespace ${NAMESPACE} ready"

# ── Phase 2: Install vCluster ────────────────────────────────────────────────

log_event "vcluster-create" "ok" "Installing vCluster ${SLUG} in ${NAMESPACE}"

# Ensure vcluster helm repo is available
helm repo add vcluster https://charts.loft.sh >/dev/null 2>&1 || true
helm repo update vcluster >/dev/null 2>&1 || true

# Extra SANs for the vCluster API server TLS cert:
#   [0] In-cluster DNS — provisioner connects via this during bootstrap
#   [1] External hostname — users connect via Traefik TLS passthrough
VCLUSTER_SAN="${SLUG}.${NAMESPACE}.svc.cluster.local"
VCLUSTER_EXTERNAL="${SLUG}-k8s.${DOMAIN}"

if helm status "$SLUG" -n "$NAMESPACE" >/dev/null 2>&1; then
  log_event "vcluster-create" "ok" "vCluster ${SLUG} already installed — upgrading"
  helm upgrade "$SLUG" vcluster/vcluster -n "$NAMESPACE" \
    -f "$VCLUSTER_VALUES" \
    --set "controlPlane.statefulSet.resources.limits.cpu=${CPU_LIMIT}" \
    --set "controlPlane.statefulSet.resources.limits.memory=${MEM_LIMIT}" \
    --set "controlPlane.statefulSet.persistence.volumeClaim.size=${STORAGE_LIMIT}" \
    --set "controlPlane.proxy.extraSANs[0]=${VCLUSTER_SAN}" \
    --set "controlPlane.proxy.extraSANs[1]=${VCLUSTER_EXTERNAL}" \
    --wait --timeout 300s
else
  helm install "$SLUG" vcluster/vcluster -n "$NAMESPACE" \
    -f "$VCLUSTER_VALUES" \
    --set "controlPlane.statefulSet.resources.limits.cpu=${CPU_LIMIT}" \
    --set "controlPlane.statefulSet.resources.limits.memory=${MEM_LIMIT}" \
    --set "controlPlane.statefulSet.persistence.volumeClaim.size=${STORAGE_LIMIT}" \
    --set "controlPlane.proxy.extraSANs[0]=${VCLUSTER_SAN}" \
    --set "controlPlane.proxy.extraSANs[1]=${VCLUSTER_EXTERNAL}" \
    --wait --timeout 300s
fi

log_event "vcluster-create" "ok" "vCluster helm release installed"

# ── Phase 3: Wait for vCluster Ready ────────────────────────────────────────

log_event "vcluster-ready" "ok" "Waiting for vCluster to be ready"

# vcluster-k8s chart creates a Deployment (not StatefulSet) for the control plane
if kubectl get deployment "${SLUG}" -n "$NAMESPACE" >/dev/null 2>&1; then
  kubectl rollout status "deployment/${SLUG}" -n "$NAMESPACE" --timeout=300s || {
    log_event "vcluster-ready" "error" "vCluster deployment not ready after 300s"
    exit 1
  }
elif kubectl get statefulset "${SLUG}" -n "$NAMESPACE" >/dev/null 2>&1; then
  kubectl rollout status "statefulset/${SLUG}" -n "$NAMESPACE" --timeout=300s || {
    log_event "vcluster-ready" "error" "vCluster statefulset not ready after 300s"
    exit 1
  }
else
  log_event "vcluster-ready" "error" "No vCluster deployment or statefulset found"
  exit 1
fi

log_event "vcluster-ready" "ok" "vCluster pod is ready"

# ── Phase 4: Extract Kubeconfig ──────────────────────────────────────────────

log_event "kubeconfig" "ok" "Extracting vCluster kubeconfig"

WORK_DIR=$(mktemp -d)
VCLUSTER_KUBECONFIG="${WORK_DIR}/kubeconfig"

kubectl get secret "vc-${SLUG}" -n "$NAMESPACE" \
  -o jsonpath='{.data.config}' | base64 -d > "$VCLUSTER_KUBECONFIG"

# Rewrite kubeconfig server URL to use in-cluster service DNS (no port-forward needed).
# The provisioner pod runs on the host cluster and can reach the vCluster service directly.
VCLUSTER_SVC="https://${SLUG}.${NAMESPACE}.svc.cluster.local:443"
if sed --version >/dev/null 2>&1; then
  sed -i "s|server:.*|server: ${VCLUSTER_SVC}|" "$VCLUSTER_KUBECONFIG"
else
  sed -i '' "s|server:.*|server: ${VCLUSTER_SVC}|" "$VCLUSTER_KUBECONFIG"
fi

log_event "kubeconfig" "ok" "Kubeconfig extracted and rewritten to ${VCLUSTER_SVC}"

# ── Phase 5: Verify vCluster API Connectivity ────────────────────────────────

log_event "connectivity" "ok" "Verifying vCluster API via in-cluster DNS"

for attempt in $(seq 1 20); do
  if KUBECONFIG="$VCLUSTER_KUBECONFIG" kubectl get namespaces --request-timeout=5s >/dev/null 2>&1; then
    break
  fi
  if [ "$attempt" -eq 20 ]; then
    log_event "connectivity" "error" "Cannot reach vCluster API after 60s"
    exit 1
  fi
  sleep 3
done

log_event "connectivity" "ok" "vCluster API reachable via in-cluster DNS"

# ── Phase 6: Generate Instance Config ────────────────────────────────────────

log_event "config-gen" "ok" "Generating open-platform config for instance"

INSTANCE_DIR="${WORK_DIR}/instance"
mkdir -p "$INSTANCE_DIR"

# Copy the repo content needed for config generation
cp -r "$ROOT_DIR/scripts" "$INSTANCE_DIR/"
cp -r "$ROOT_DIR/config" "$INSTANCE_DIR/"
mkdir -p "$INSTANCE_DIR/templates" "$INSTANCE_DIR/platform"

# Copy manifests (static files needed by helmfile hooks)
if [ -d "$ROOT_DIR/manifests" ]; then
  cp -r "$ROOT_DIR/manifests" "$INSTANCE_DIR/"
else
  mkdir -p "$INSTANCE_DIR/manifests"
fi

# Copy template app if it exists
if [ -d "$ROOT_DIR/templates" ]; then
  cp -r "$ROOT_DIR/templates" "$INSTANCE_DIR/"
fi

# Copy app sources if they exist
if [ -d "$ROOT_DIR/apps" ]; then
  cp -r "$ROOT_DIR/apps" "$INSTANCE_DIR/"
fi

# Copy host assets needed
cp -r "$ROOT_DIR/host" "$INSTANCE_DIR/" 2>/dev/null || true

# Generate open-platform.yaml for this instance
# Customer vClusters use selfsigned TLS (host Traefik provides real certs via default TLSStore)
cat > "${INSTANCE_DIR}/open-platform.yaml" <<EOF
domain: ${DOMAIN}
service_prefix: "${SLUG}-"
admin:
  username: "${ADMIN_USERNAME}"
  email: "${ADMIN_EMAIL}"
tls:
  mode: selfsigned
EOF

# Generate traefik-values.yaml for customer vCluster
# Must be Deployment (not DaemonSet) — vCluster pods sync to host, hostNetwork would steal host ports
cat > "${INSTANCE_DIR}/traefik-values.yaml" <<'TEOF'
api:
  dashboard: true
  insecure: true
logs:
  access:
    enabled: true
deployment:
  kind: Deployment
  replicas: 1
ports:
  web:
    port: 80
  websecure:
    port: 443
providers:
  kubernetesCRD:
    allowExternalNameServices: true
    allowEmptyServices: true
  kubernetesIngress:
    allowExternalNameServices: true
    allowEmptyServices: true
service:
  type: ClusterIP
TEOF

# Run config generation
cd "$INSTANCE_DIR"
"${INSTANCE_DIR}/scripts/generate-config.sh"
cd "$ROOT_DIR"

log_event "config-gen" "ok" "Instance config generated (prefix=${SLUG}-)"

# ── Phase 7: Deploy into vCluster ────────────────────────────────────────────

log_event "deploy" "ok" "Starting open-platform deploy into vCluster"

# Source the generated .env for the instance
set -a
# shellcheck source=/dev/null
source "${INSTANCE_DIR}/.env"
set +a

# Export KUBECONFIG to target the vCluster for all subsequent operations
export KUBECONFIG="$VCLUSTER_KUBECONFIG"

# Phase 7a: helmfile sync (bootstrap all releases inside vCluster)
# Skip flux (tier=platform) — customer vClusters are managed by provisioner, not GitOps
log_event "deploy-helmfile" "ok" "Running helmfile sync inside vCluster (excluding flux)"

cd "$INSTANCE_DIR"
HELMFILE_EXIT=0
helmfile sync --selector 'tier!=platform' || HELMFILE_EXIT=$?

if [ "$HELMFILE_EXIT" -ne 0 ]; then
  # helmfile may fail from non-critical postsync hooks (woodpecker repos, system org).
  # If core services are running, treat as success.
  if KUBECONFIG="$VCLUSTER_KUBECONFIG" kubectl get deploy -n forgejo -l app.kubernetes.io/name=forgejo -o jsonpath='{.items[0].status.readyReplicas}' 2>/dev/null | grep -q "1"; then
    log_event "deploy-helmfile" "ok" "helmfile sync completed (with non-fatal hook warnings)"
  else
    log_event "deploy-helmfile" "error" "helmfile sync failed"
    cd "$ROOT_DIR"
    exit 1
  fi
else
  log_event "deploy-helmfile" "ok" "helmfile sync completed"
fi
cd "$ROOT_DIR"

# Phase 7b: Post-sync setup (OIDC, Woodpecker repos)
# These scripts use KUBECONFIG and PLATFORM_DOMAIN from environment
log_event "deploy-post" "ok" "Running post-deploy setup"

# Skip setup-oidc.sh — we configure OIDC on the vCluster API server directly
log_event "deploy-post" "ok" "Skipping setup-oidc.sh (vCluster OIDC configured via helm upgrade)"

if [ -x "${INSTANCE_DIR}/scripts/setup-woodpecker-repos.sh" ]; then
  "${INSTANCE_DIR}/scripts/setup-woodpecker-repos.sh" || log_event "deploy-post" "warn" "setup-woodpecker-repos.sh had issues (non-fatal)"
fi

# Phase 7c: Configure vCluster API server OIDC
# setup-oauth2.sh (helmfile postsync) created the Headlamp OAuth2 app.
# Now upgrade the vCluster with OIDC args + CA cert so the API server validates Headlamp tokens.
OIDC_CLIENT_ID=$(kubectl get secret oidc -n headlamp -o jsonpath='{.data.OIDC_CLIENT_ID}' 2>/dev/null | base64 -d)
if [ -n "$OIDC_CLIENT_ID" ]; then
  log_event "deploy-oidc" "ok" "Configuring vCluster API server OIDC (client_id=${OIDC_CLIENT_ID})"
  unset KUBECONFIG  # Target host cluster for helm upgrade

  # Create CA cert secret in the vCluster namespace (host cluster) so the API server
  # can validate OIDC tokens from the Forgejo issuer behind a self-signed cert.
  CA_CERT_FILE="${INSTANCE_DIR}/certs/ca.crt"
  if [ ! -f "$CA_CERT_FILE" ]; then
    CA_CERT_FILE="${ROOT_DIR}/certs/ca.crt"
  fi

  if [ -f "$CA_CERT_FILE" ]; then
    kubectl create secret generic oidc-ca-cert -n "$NAMESPACE" \
      --from-file=ca.crt="$CA_CERT_FILE" \
      --dry-run=client -o yaml | kubectl apply -f -
    log_event "deploy-oidc" "ok" "CA cert secret created in ${NAMESPACE}"
  else
    log_event "deploy-oidc" "warn" "No CA cert found — OIDC token validation may fail"
  fi

  # Generate override YAML with CA volume mount + OIDC args
  OIDC_OVERRIDE="${WORK_DIR}/oidc-override.yaml"
  cat > "$OIDC_OVERRIDE" <<OIDC_EOF
controlPlane:
  distro:
    k8s:
      apiServer:
        extraArgs:
          - --service-cluster-ip-range=10.43.0.0/16
          - --oidc-issuer-url=https://${SLUG}-forgejo.${DOMAIN}
          - --oidc-client-id=${OIDC_CLIENT_ID}
          - --oidc-username-claim=preferred_username
          - --oidc-username-prefix=-
          - --oidc-groups-claim=groups
          - --oidc-ca-file=/etc/oidc-ca/ca.crt
  statefulSet:
    persistence:
      addVolumes:
        - name: oidc-ca
          secret:
            secretName: oidc-ca-cert
      addVolumeMounts:
        - name: oidc-ca
          mountPath: /etc/oidc-ca
          readOnly: true
OIDC_EOF

  # Delete StatefulSet with orphan cascade to avoid immutable field errors on upgrade.
  # The existing pod is preserved; helm upgrade creates a new StatefulSet that adopts it.
  kubectl delete statefulset "$SLUG" -n "$NAMESPACE" --cascade=orphan 2>/dev/null || true

  helm upgrade "$SLUG" vcluster/vcluster -n "$NAMESPACE" \
    -f "$VCLUSTER_VALUES" \
    -f "$OIDC_OVERRIDE" \
    --set "controlPlane.proxy.extraSANs[0]=${VCLUSTER_SAN}" \
    --set "controlPlane.proxy.extraSANs[1]=${VCLUSTER_EXTERNAL}" \
    --wait --timeout 300s 2>&1 || log_event "deploy-oidc" "warn" "vCluster OIDC upgrade had issues"

  # Wait for vCluster API to be reachable after OIDC upgrade (pod restarts)
  export KUBECONFIG="${VCLUSTER_KUBECONFIG}"
  ensure_vcluster_api

  log_event "deploy-oidc" "ok" "vCluster API server OIDC configured with CA cert"

  # Validate OIDC: verify the API server can reach Forgejo's OIDC discovery endpoint
  unset KUBECONFIG  # temporarily target host to exec into vCluster pod
  if kubectl exec -n "$NAMESPACE" "${SLUG}-0" -- \
    wget -q --no-check-certificate -O /dev/null \
    "https://${SLUG}-forgejo.${DOMAIN}/.well-known/openid-configuration" 2>/dev/null; then
    log_event "deploy-oidc" "ok" "OIDC discovery endpoint reachable from API server"
  else
    log_event "deploy-oidc" "warn" "OIDC discovery endpoint NOT reachable — Headlamp login may fail"
  fi

  export KUBECONFIG="${VCLUSTER_KUBECONFIG}"

  # Create RBAC binding so OIDC-authenticated user gets cluster-admin
  cat <<RBAC_EOF | kubectl apply -f -
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: oidc-admin
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: cluster-admin
subjects:
- apiGroup: rbac.authorization.k8s.io
  kind: User
  name: "${ADMIN_USERNAME}"
RBAC_EOF
  log_event "deploy-oidc" "ok" "OIDC RBAC binding created for ${ADMIN_USERNAME}"

  log_event "deploy-oidc" "ok" "OIDC configuration complete"
else
  log_event "deploy-oidc" "warn" "Headlamp OIDC secret not found — skipping API server OIDC"
fi

log_event "deploy" "ok" "Open-platform deploy complete inside vCluster"

# ── Phase 8: Store Instance Metadata ─────────────────────────────────────────

log_event "metadata" "ok" "Storing instance metadata as ConfigMap"

# Unset KUBECONFIG to target the host cluster again
unset KUBECONFIG

# Store instance metadata on the host cluster
kubectl create configmap "instance-${SLUG}" -n "$NAMESPACE" \
  --from-literal=slug="$SLUG" \
  --from-literal=tier="$TIER" \
  --from-literal=admin_username="$ADMIN_USERNAME" \
  --from-literal=admin_email="$ADMIN_EMAIL" \
  --from-literal=domain="${SLUG}-forgejo.${DOMAIN}" \
  --from-literal=provisioned_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
  --dry-run=client -o yaml | kubectl apply -f -

log_event "metadata" "ok" "Instance metadata stored"

# Create Headlamp X-Forwarded-Proto middleware on HOST (Traefik runs on host, not in vCluster)
# vCluster syncer preserves host-side annotations not in managed-annotations list
cat <<MW_EOF | kubectl apply -f -
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: headlamp-headers
  namespace: ${NAMESPACE}
spec:
  headers:
    customRequestHeaders:
      X-Forwarded-Proto: "https"
MW_EOF

# Annotate host-side synced ingress with middleware reference
HEADLAMP_INGRESS="headlamp-x-headlamp-x-${SLUG}"
HEADLAMP_MW_SET=false
for attempt in $(seq 1 30); do
  if kubectl get ingress "$HEADLAMP_INGRESS" -n "$NAMESPACE" >/dev/null 2>&1; then
    kubectl annotate ingress "$HEADLAMP_INGRESS" -n "$NAMESPACE" \
      traefik.ingress.kubernetes.io/router.middlewares="${NAMESPACE}-headlamp-headers@kubernetescrd" \
      --overwrite
    log_event "metadata" "ok" "Headlamp middleware and annotation configured"
    HEADLAMP_MW_SET=true
    break
  fi
  sleep 3
done
if [ "$HEADLAMP_MW_SET" = "false" ]; then
  log_event "metadata" "warn" "Headlamp ingress not found after 90s — middleware not set, OIDC login will fail"
fi

# Create IngressRouteTCP for external kubectl access via Traefik TLS passthrough.
# SNI-based routing on the websecure entrypoint — Traefik passes TLS directly
# to the vCluster API server without termination.
cat <<TCP_EOF | kubectl apply -f -
apiVersion: traefik.io/v1alpha1
kind: IngressRouteTCP
metadata:
  name: ${SLUG}-k8s
  namespace: ${NAMESPACE}
spec:
  entryPoints:
    - websecure
  routes:
    - match: HostSNI(\`${SLUG}-k8s.${DOMAIN}\`)
      services:
        - name: ${SLUG}
          port: 443
  tls:
    passthrough: true
TCP_EOF
log_event "metadata" "ok" "IngressRouteTCP created for external kubectl access"

# Write admin password to file for reconciler to pick up and store in console DB
echo "$FORGEJO_ADMIN_PASSWORD" > "/tmp/provision-${SLUG}.password"

# Write user-facing kubeconfig for reconciler to store in console DB.
# Re-extract raw kubeconfig, then rewrite server URL for external access.
kubectl get secret "vc-${SLUG}" -n "$NAMESPACE" \
  -o jsonpath='{.data.config}' | base64 -d > "/tmp/provision-${SLUG}.kubeconfig"
if sed --version >/dev/null 2>&1; then
  sed -i "s|server:.*|server: https://${SLUG}-k8s.${DOMAIN}|" "/tmp/provision-${SLUG}.kubeconfig"
else
  sed -i '' "s|server:.*|server: https://${SLUG}-k8s.${DOMAIN}|" "/tmp/provision-${SLUG}.kubeconfig"
fi
log_event "metadata" "ok" "Kubeconfig saved with server https://${SLUG}-k8s.${DOMAIN}"

# ── Done ─────────────────────────────────────────────────────────────────────

log_event "complete" "ok" "Instance ${SLUG} provisioned successfully"

echo ""
echo "=== Instance Provisioned ==="
echo ""
echo "  Slug:      ${SLUG}"
echo "  Tier:      ${TIER}"
echo "  Namespace: ${NAMESPACE}"
echo "  Admin:     ${ADMIN_USERNAME} <${ADMIN_EMAIL}>"
echo ""
echo "  Services:"
echo "    Forgejo:    https://${SLUG}-forgejo.${DOMAIN}"
echo "    Woodpecker: https://${SLUG}-ci.${DOMAIN}"
echo "    Headlamp:   https://${SLUG}-headlamp.${DOMAIN}"
echo "    MinIO:      https://${SLUG}-minio.${DOMAIN}"
echo ""
echo "  Log: ${LOG_FILE}"
