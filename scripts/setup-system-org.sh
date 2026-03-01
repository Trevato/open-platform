#!/usr/bin/env bash
set -euo pipefail

# Creates the system org in Forgejo, pushes platform config and app template,
# creates a demo app from the template, and deploys it.
# Idempotent — skips resources that already exist.
# Runs as a forgejo postsync hook after setup-oauth2.sh.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

FORGEJO_URL="https://forgejo.dev.test"
API_URL="${FORGEJO_URL}/api/v1"
CA_CERT="${ROOT_DIR}/certs/ca.crt"

ADMIN_USER=$(kubectl get secret forgejo-admin-credentials -n forgejo -o jsonpath='{.data.username}' | base64 -d)
ADMIN_PASS=$(kubectl get secret forgejo-admin-credentials -n forgejo -o jsonpath='{.data.password}' | base64 -d)

api() {
  curl -fsSk -u "${ADMIN_USER}:${ADMIN_PASS}" "$@"
}

# ── Create system org ────────────────────────────────────────────────────────

if api "${API_URL}/orgs/system" >/dev/null 2>&1; then
  echo "Organization 'system' already exists."
else
  echo "Creating 'system' organization..."
  api -X POST "${API_URL}/orgs" \
    -H "Content-Type: application/json" \
    -d '{"username": "system", "visibility": "public", "description": "Platform system repositories"}'
  echo "Created 'system' organization."
fi

# ── Helper: push directory content to a Forgejo repo ─────────────────────────

push_content() {
  local REPO_NAME="$1"
  local SOURCE_DIR="$2"
  local REPO_URL="https://${ADMIN_USER}:${ADMIN_PASS}@forgejo.dev.test/system/${REPO_NAME}.git"

  # Check if repo already has commits
  local COMMIT_COUNT
  COMMIT_COUNT=$(api "${API_URL}/repos/system/${REPO_NAME}/commits?limit=1&sha=main" 2>/dev/null | jq 'length' 2>/dev/null || echo "0")

  if [ "$COMMIT_COUNT" != "0" ]; then
    echo "Repo 'system/${REPO_NAME}' already has content — skipping push."
    return 0
  fi

  echo "Pushing content to 'system/${REPO_NAME}'..."

  local TMP_DIR
  TMP_DIR=$(mktemp -d)
  trap "rm -rf ${TMP_DIR}" RETURN

  cp -r "${SOURCE_DIR}/"* "${TMP_DIR}/" 2>/dev/null || true
  # Also copy dotfiles (like .woodpecker/)
  cp -r "${SOURCE_DIR}/".[!.]* "${TMP_DIR}/" 2>/dev/null || true

  cd "${TMP_DIR}"
  git init -q
  git checkout -b main
  git add .
  git -c user.name="Open Platform" -c user.email="system@dev.test" commit -q -m "Initial commit"
  GIT_SSL_CAINFO="${CA_CERT}" git push -q "${REPO_URL}" main 2>/dev/null
  cd "${ROOT_DIR}"

  echo "Pushed content to 'system/${REPO_NAME}'."
}

# ── Helper: create repo if it doesn't exist ──────────────────────────────────

create_repo() {
  local REPO_NAME="$1"
  local DESCRIPTION="${2:-}"

  if api "${API_URL}/repos/system/${REPO_NAME}" >/dev/null 2>&1; then
    echo "Repo 'system/${REPO_NAME}' already exists."
    return 0
  fi

  echo "Creating repo 'system/${REPO_NAME}'..."
  api -X POST "${API_URL}/orgs/system/repos" \
    -H "Content-Type: application/json" \
    -d "{\"name\": \"${REPO_NAME}\", \"description\": \"${DESCRIPTION}\", \"auto_init\": false, \"private\": false}"
  echo "Created repo 'system/${REPO_NAME}'."
}

# ── Push open-platform config ────────────────────────────────────────────────

create_repo "open-platform" "Platform configuration (Flux-managed)"
push_content "open-platform" "${ROOT_DIR}/platform"

# ── Push app template ────────────────────────────────────────────────────────

create_repo "template" "Application template"
push_content "template" "${ROOT_DIR}/templates/app"

# Mark as template repo
echo "Marking 'system/template' as a template repo..."
api -X PATCH "${API_URL}/repos/system/template" \
  -H "Content-Type: application/json" \
  -d '{"template": true}' >/dev/null
echo "Marked as template."

# ── Create demo-app from template ────────────────────────────────────────────

if api "${API_URL}/repos/system/demo-app" >/dev/null 2>&1; then
  echo "Repo 'system/demo-app' already exists."
else
  echo "Creating 'system/demo-app' from template..."
  api -X POST "${API_URL}/repos/system/template/generate" \
    -H "Content-Type: application/json" \
    -d '{"owner": "system", "name": "demo-app", "description": "Demo application", "private": false, "git_content": true}' >/dev/null
  echo "Created 'system/demo-app' from template."
fi

# ── Deploy demo-app to cluster ──────────────────────────────────────────────

echo "Deploying demo-app..."

# Ensure namespace exists (should already from namespaces.yaml but be safe)
kubectl create namespace demo-app --dry-run=client -o yaml | kubectl apply -f -

# Apply k8s manifests from the template (with demo-app naming)
kubectl apply -n demo-app -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: demo-app
spec:
  replicas: 1
  selector:
    matchLabels:
      app: demo-app
  template:
    metadata:
      labels:
        app: demo-app
    spec:
      containers:
        - name: app
          image: traefik/whoami
          ports:
            - containerPort: 80
          resources:
            requests:
              memory: "64Mi"
              cpu: "50m"
            limits:
              memory: "128Mi"
              cpu: "200m"
---
apiVersion: v1
kind: Service
metadata:
  name: demo-app
spec:
  selector:
    app: demo-app
  ports:
    - port: 80
      targetPort: 80
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: demo-app
spec:
  ingressClassName: traefik
  rules:
    - host: demo-app.dev.test
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: demo-app
                port:
                  number: 80
EOF

echo "Demo app deployed at https://demo-app.dev.test"
echo "System org setup complete."
