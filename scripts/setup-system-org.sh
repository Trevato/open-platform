#!/usr/bin/env bash
set -euo pipefail

# Creates the system org in Forgejo, pushes platform config, app template,
# and app repositories. CI pipelines handle building and deploying.
# Idempotent — skips resources that already exist.
# Runs as a forgejo postsync hook after setup-oauth2.sh.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

DOMAIN="${PLATFORM_DOMAIN:?PLATFORM_DOMAIN not set — run generate-config.sh first}"

ADMIN_USER=$(kubectl get secret forgejo-admin-credentials -n forgejo -o jsonpath='{.data.username}' | base64 -d)
ADMIN_PASS=$(kubectl get secret forgejo-admin-credentials -n forgejo -o jsonpath='{.data.password}' | base64 -d)

# Use port-forward for Forgejo access (works without DNS/ingress)
FORGEJO_LOCAL_PORT=3334
kubectl port-forward -n forgejo svc/forgejo-http ${FORGEJO_LOCAL_PORT}:3000 &
PF_PID=$!
# Clean up port-forward and askpass helper on exit
trap "kill $PF_PID 2>/dev/null || true; rm -f ${SCRIPT_DIR}/.git-askpass" EXIT
sleep 2  # wait for port-forward to establish

API_URL="http://localhost:${FORGEJO_LOCAL_PORT}/api/v1"

api() {
  curl -fsSk -u "${ADMIN_USER}:${ADMIN_PASS}" "$@"
}

# Git credential helper — avoids embedding passwords in URLs or process args
git_push() {
  local REPO_NAME="$1"
  local BRANCH="$2"
  local REPO_URL="http://localhost:${FORGEJO_LOCAL_PORT}/system/${REPO_NAME}.git"

  GIT_ASKPASS="${SCRIPT_DIR}/.git-askpass" \
  GIT_USERNAME="${ADMIN_USER}" \
  GIT_PASSWORD="${ADMIN_PASS}" \
    git push -q "${REPO_URL}" "${BRANCH}"
}

# Create askpass helper (git calls this for username and password)
cat > "${SCRIPT_DIR}/.git-askpass" <<'ASKPASS'
#!/bin/sh
case "$1" in
  *Username*|*username*) echo "$GIT_USERNAME" ;;
  *Password*|*password*) echo "$GIT_PASSWORD" ;;
esac
ASKPASS
chmod +x "${SCRIPT_DIR}/.git-askpass"

# ── Create system org ────────────────────────────────────────────────────────

if api "${API_URL}/orgs/system" >/dev/null 2>&1; then
  echo "Organization 'system' already exists."
else
  echo "Creating 'system' organization..."
  api -X POST "${API_URL}/orgs" \
    -H "Content-Type: application/json" \
    -d '{"username": "system", "visibility": "private", "description": "Platform system repositories"}'
  echo "Created 'system' organization."
fi

# ── Helper: push directory content to a Forgejo repo ─────────────────────────

push_content() {
  local REPO_NAME="$1"
  local SOURCE_DIR="$2"

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
  # Also copy dotfiles (like .woodpecker/) but exclude .git
  cp -r "${SOURCE_DIR}/".[!.]* "${TMP_DIR}/" 2>/dev/null || true
  rm -rf "${TMP_DIR}/.git"
  # Remove build artifacts that may exist locally
  rm -rf "${TMP_DIR}/node_modules" "${TMP_DIR}/.next" "${TMP_DIR}/bun.lock"
  rm -f "${TMP_DIR}/tsconfig.tsbuildinfo"

  cd "${TMP_DIR}"
  git init -q
  git checkout -b main
  git add .
  git -c user.name="Open Platform" -c user.email="system@${DOMAIN}" commit -q -m "Initial commit"
  git_push "${REPO_NAME}" main
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
    -d "{\"name\": \"${REPO_NAME}\", \"description\": \"${DESCRIPTION}\", \"auto_init\": false, \"private\": true}"
  echo "Created repo 'system/${REPO_NAME}'."
}

# ── Push open-platform deployment content ────────────────────────────────────
# Includes platform config (Flux), scripts, config templates, manifests, charts.

create_repo "open-platform" "Platform configuration and deployment content"

# Custom push: selective directories (not the whole monorepo)
_push_open_platform() {
  local COMMIT_COUNT
  COMMIT_COUNT=$(api "${API_URL}/repos/system/open-platform/commits?limit=1&sha=main" 2>/dev/null | jq 'length' 2>/dev/null || echo "0")
  if [ "$COMMIT_COUNT" != "0" ]; then
    echo "Repo 'system/open-platform' already has content — skipping push."
    return 0
  fi
  echo "Pushing deployment content to 'system/open-platform'..."
  local TMP_DIR
  TMP_DIR=$(mktemp -d)
  trap "rm -rf ${TMP_DIR}" RETURN
  for dir in platform scripts config manifests charts host templates; do
    [ -d "${ROOT_DIR}/${dir}" ] && cp -r "${ROOT_DIR}/${dir}" "${TMP_DIR}/"
  done
  for file in Makefile open-platform.yaml.example; do
    [ -f "${ROOT_DIR}/${file}" ] && cp "${ROOT_DIR}/${file}" "${TMP_DIR}/"
  done
  rm -rf "${TMP_DIR}/.git"
  cd "${TMP_DIR}"
  git init -q
  git checkout -b main
  git add .
  git -c user.name="Open Platform" -c user.email="system@${DOMAIN}" commit -q -m "Initial commit"
  git_push "open-platform" main
  cd "${ROOT_DIR}"
  echo "Pushed deployment content to 'system/open-platform'."
}
_push_open_platform

# ── Push app template ────────────────────────────────────────────────────────

create_repo "template" "Application template"
push_content "template" "${ROOT_DIR}/templates/app"

# Mark as template repo
echo "Marking 'system/template' as a template repo..."
api -X PATCH "${API_URL}/repos/system/template" \
  -H "Content-Type: application/json" \
  -d '{"template": true}' >/dev/null
echo "Marked as template."

# Console — platform control center
create_repo "console" "Platform console — dashboard, services, apps, users, terminal"
push_content "console" "${ROOT_DIR}/apps/console"

# ── Create and push op-api ─────────────────────────────────────────────────

create_repo "op-api" "Platform API — REST and MCP interface for repos, pipelines, apps"
push_content "op-api" "${ROOT_DIR}/apps/op-api"

# ── Branch Protections ──────────────────────────────────────────────────────
# Require PRs for changes to main on all system repos.
# Idempotent — skips repos that already have protection.

echo "Setting branch protections..."
SYSTEM_REPOS=$(api "${API_URL}/orgs/system/repos?limit=50" | jq -r '.[].name')

for REPO in $SYSTEM_REPOS; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -u "${ADMIN_USER}:${ADMIN_PASS}" \
    "${API_URL}/repos/system/${REPO}/branch_protections/main")

  if [ "$STATUS" = "404" ]; then
    api -X POST "${API_URL}/repos/system/${REPO}/branch_protections" \
      -H "Content-Type: application/json" \
      -d '{"branch_name":"main","enable_push":false,"enable_force_push":false}' >/dev/null
    echo "  Protected: system/${REPO}"
  else
    echo "  Already protected: system/${REPO}"
  fi
done

echo "System org setup complete."
