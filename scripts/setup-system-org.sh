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

# Wait for Forgejo to index the template content before generating from it
echo "Waiting for template to be ready..."
for i in $(seq 1 15); do
  BRANCH=$(api "${API_URL}/repos/system/template" 2>/dev/null | jq -r '.default_branch // empty')
  if [ -n "$BRANCH" ]; then
    break
  fi
  sleep 1
done

# ── Create demo-app from template ────────────────────────────────────────────

if api "${API_URL}/repos/system/demo-app" >/dev/null 2>&1; then
  # Check if it's empty (failed previous generate)
  DEMO_BRANCH=$(api "${API_URL}/repos/system/demo-app" 2>/dev/null | jq -r '.default_branch // empty')
  if [ -n "$DEMO_BRANCH" ]; then
    echo "Repo 'system/demo-app' already exists with content."
  else
    echo "Repo 'system/demo-app' exists but is empty — recreating..."
    api -X DELETE "${API_URL}/repos/system/demo-app" >/dev/null
    sleep 1
    api -X POST "${API_URL}/repos/system/template/generate" \
      -H "Content-Type: application/json" \
      -d '{"owner": "system", "name": "demo-app", "description": "Demo application", "private": false, "git_content": true}' >/dev/null
    echo "Recreated 'system/demo-app' from template."
  fi
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

# ── Create and deploy social app ──────────────────────────────────────────

create_repo "social" "Social media app — posts, images, auth"

# Push social app content (main branch + feature branch with PR)
push_social() {
  local REPO_URL="https://${ADMIN_USER}:${ADMIN_PASS}@forgejo.dev.test/system/social.git"
  local SOURCE_DIR="${ROOT_DIR}/apps/social"
  local OVERRIDES_DIR="${ROOT_DIR}/apps/social-overrides"

  # Check if repo already has commits
  local COMMIT_COUNT
  COMMIT_COUNT=$(api "${API_URL}/repos/system/social/commits?limit=1&sha=main" 2>/dev/null | jq 'length' 2>/dev/null || echo "0")

  if [ "$COMMIT_COUNT" != "0" ]; then
    echo "Repo 'system/social' already has content — skipping push."
    return 0
  fi

  echo "Pushing content to 'system/social'..."

  local TMP_DIR
  TMP_DIR=$(mktemp -d)

  # Copy full app (feat/markdown-posts version)
  cp -r "${SOURCE_DIR}/"* "${TMP_DIR}/" 2>/dev/null || true
  cp -r "${SOURCE_DIR}/".[!.]* "${TMP_DIR}/" 2>/dev/null || true

  cd "${TMP_DIR}"
  git init -q
  git checkout -b main

  # For main branch: overlay with non-markdown versions and remove PostBody
  cp "${OVERRIDES_DIR}/page.tsx" src/app/page.tsx
  cp "${OVERRIDES_DIR}/package.json" package.json
  rm -f src/app/components/post-body.tsx

  git add .
  git -c user.name="Open Platform" -c user.email="system@dev.test" \
    commit -q -m "social media app: posts feed, image uploads, forgejo auth"
  GIT_SSL_CAINFO="${CA_CERT}" git push -q "${REPO_URL}" main 2>/dev/null

  # Create feature branch with markdown additions
  git checkout -b feat/markdown-posts

  # Restore original files from source (with PostBody)
  cp "${SOURCE_DIR}/src/app/page.tsx" src/app/page.tsx
  cp "${SOURCE_DIR}/package.json" package.json
  mkdir -p src/app/components
  cp "${SOURCE_DIR}/src/app/components/post-body.tsx" src/app/components/post-body.tsx

  git add .
  git -c user.name="Open Platform" -c user.email="system@dev.test" \
    commit -q -m "feat: render post bodies as markdown"
  GIT_SSL_CAINFO="${CA_CERT}" git push -q "${REPO_URL}" feat/markdown-posts 2>/dev/null

  cd "${ROOT_DIR}"
  rm -rf "${TMP_DIR}"
  echo "Pushed content to 'system/social' (main + feat/markdown-posts)."
}

push_social

# Create PR for the markdown feature branch
PR_EXISTS=$(api "${API_URL}/repos/system/social/pulls?state=open&head=feat/markdown-posts" 2>/dev/null | jq 'length' 2>/dev/null || echo "0")
if [ "$PR_EXISTS" = "0" ]; then
  api -X POST "${API_URL}/repos/system/social/pulls" \
    -H "Content-Type: application/json" \
    -d '{"title": "feat: render post bodies as markdown", "body": "Adds markdown rendering for post bodies using react-markdown.\n\n- New `PostBody` client component with styled markdown elements\n- Supports bold, italic, links, code blocks, lists, and blockquotes\n- Adds `react-markdown` dependency", "head": "feat/markdown-posts", "base": "main"}' >/dev/null
  echo "Created PR for feat/markdown-posts."
else
  echo "PR for feat/markdown-posts already exists."
fi

# Provision social app infrastructure
echo "Provisioning social app infrastructure..."

# Copy shared secrets/configmaps into social namespace
kubectl get secret minio-credentials -n minio -o json | \
  jq '.metadata.namespace = "social" | del(.metadata.resourceVersion, .metadata.uid, .metadata.creationTimestamp)' | \
  kubectl apply -f -
kubectl get configmap platform-ca -n kube-system -o json | \
  jq '.metadata.namespace = "social" | del(.metadata.resourceVersion, .metadata.uid, .metadata.creationTimestamp)' | \
  kubectl apply -f -

# Create forgejo-registry secret for image pulls
kubectl create secret docker-registry forgejo-registry \
  --docker-server=forgejo.dev.test \
  --docker-username="${ADMIN_USER}" \
  --docker-password="${ADMIN_PASS}" \
  -n social --dry-run=client -o yaml | kubectl apply -f -

# Create database and user
SOCIAL_DB_CREATED=""
kubectl exec -n postgres postgres-1 -- psql -U postgres -tc \
  "SELECT 1 FROM pg_database WHERE datname = 'social'" | grep -q 1 || {
  kubectl exec -n postgres postgres-1 -- psql -U postgres -c "CREATE DATABASE social"
  kubectl exec -n postgres postgres-1 -- psql -U postgres -c "CREATE USER social WITH PASSWORD 'social'" || true
  kubectl exec -n postgres postgres-1 -- psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE social TO social"
  kubectl exec -n postgres postgres-1 -- psql -U postgres -c "ALTER DATABASE social OWNER TO social"
  SOCIAL_DB_CREATED="true"
}

# Apply schema (idempotent via CREATE TABLE IF NOT EXISTS)
kubectl exec -i -n postgres postgres-1 -- psql -U postgres -d social < "${ROOT_DIR}/apps/social/schema.sql"
kubectl exec -n postgres postgres-1 -- psql -U postgres -d social -c \
  "GRANT ALL ON ALL TABLES IN SCHEMA public TO social; GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO social;"

# Run seed data only on first creation
if [ "${SOCIAL_DB_CREATED}" = "true" ]; then
  echo "Seeding social database..."
  for f in $(ls "${ROOT_DIR}/apps/social/seed/sql/"*.sql 2>/dev/null | sort); do
    kubectl exec -i -n postgres postgres-1 -- psql -U postgres -d social < "$f"
  done
fi

# Create S3 bucket with public download access
kubectl run minio-social-init --rm -i --restart=Never \
  --image=minio/mc:latest -n minio \
  --overrides='{"spec":{"containers":[{"name":"minio-social-init","image":"minio/mc:latest","command":["sh","-c"],"args":["mc alias set minio http://minio.minio.svc:9000 $(cat /minio/rootUser) $(cat /minio/rootPassword) && mc mb --ignore-existing minio/social && mc anonymous set download minio/social"],"volumeMounts":[{"name":"creds","mountPath":"/minio"}]}],"volumes":[{"name":"creds","secret":{"secretName":"minio-credentials"}}]}}'

# Build and deploy social app
echo "Building social app image..."
echo "${ADMIN_PASS}" | docker login forgejo.dev.test -u "${ADMIN_USER}" --password-stdin >/dev/null 2>&1
docker build -q -t forgejo.dev.test/system/social:initial "${ROOT_DIR}/apps/social"
docker push -q forgejo.dev.test/system/social:initial

echo "Deploying social app..."
kubectl apply -n social -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: social
spec:
  replicas: 1
  selector:
    matchLabels:
      app: social
  template:
    metadata:
      labels:
        app: social
    spec:
      imagePullSecrets:
        - name: forgejo-registry
      containers:
        - name: app
          image: forgejo.dev.test/system/social:initial
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 3000
          env:
            - name: DATABASE_URL
              value: "postgresql://social:social@postgres-rw.postgres.svc.cluster.local:5432/social"
            - name: S3_ENDPOINT
              value: "http://minio.minio.svc:9000"
            - name: S3_BUCKET
              value: "social"
            - name: S3_PUBLIC_URL
              value: "https://s3.dev.test"
            - name: S3_ACCESS_KEY
              valueFrom:
                secretKeyRef:
                  name: minio-credentials
                  key: rootUser
            - name: S3_SECRET_KEY
              valueFrom:
                secretKeyRef:
                  name: minio-credentials
                  key: rootPassword
            - name: BETTER_AUTH_SECRET
              valueFrom:
                secretKeyRef:
                  name: social-auth
                  key: secret
            - name: AUTH_FORGEJO_ID
              valueFrom:
                secretKeyRef:
                  name: social-auth
                  key: client-id
            - name: AUTH_FORGEJO_SECRET
              valueFrom:
                secretKeyRef:
                  name: social-auth
                  key: client-secret
            - name: BETTER_AUTH_URL
              value: "https://social.dev.test"
            - name: NODE_EXTRA_CA_CERTS
              value: "/etc/ssl/custom/ca.crt"
          volumeMounts:
            - name: platform-ca
              mountPath: /etc/ssl/custom
              readOnly: true
          resources:
            requests:
              cpu: "100m"
              memory: "128Mi"
            limits:
              cpu: "500m"
              memory: "512Mi"
      volumes:
        - name: platform-ca
          configMap:
            name: platform-ca
---
apiVersion: v1
kind: Service
metadata:
  name: social
spec:
  selector:
    app: social
  ports:
    - port: 80
      targetPort: 3000
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: social
spec:
  ingressClassName: traefik
  rules:
    - host: social.dev.test
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: social
                port:
                  number: 80
EOF

echo "Social app deployed at https://social.dev.test"
echo "System org setup complete."
