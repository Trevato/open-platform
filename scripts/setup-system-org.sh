#!/usr/bin/env bash
set -euo pipefail

# Creates the system org in Forgejo, pushes platform config, app template,
# and app repositories. CI pipelines handle building and deploying.
# Idempotent — skips resources that already exist.
# Runs as a forgejo postsync hook after setup-oauth2.sh.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

DOMAIN="${PLATFORM_DOMAIN:-product-garden.com}"
FORGEJO_URL="https://forgejo.${DOMAIN}"
API_URL="${FORGEJO_URL}/api/v1"
CA_CERT="${ROOT_DIR}/certs/ca.crt"

ADMIN_USER=$(kubectl get secret forgejo-admin-credentials -n forgejo -o jsonpath='{.data.username}' | base64 -d)
ADMIN_PASS=$(kubectl get secret forgejo-admin-credentials -n forgejo -o jsonpath='{.data.password}' | base64 -d)

api() {
  curl -fsSk -u "${ADMIN_USER}:${ADMIN_PASS}" "$@"
}

# Git credential helper — avoids embedding passwords in URLs or process args
git_push() {
  local REPO_NAME="$1"
  local BRANCH="$2"
  local REPO_URL="https://forgejo.${DOMAIN}/system/${REPO_NAME}.git"

  GIT_SSL_CAINFO="${CA_CERT}" \
  GIT_ASKPASS="${SCRIPT_DIR}/.git-askpass" \
  GIT_USERNAME="${ADMIN_USER}" \
  GIT_PASSWORD="${ADMIN_PASS}" \
    git push -q "${REPO_URL}" "${BRANCH}" 2>/dev/null
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
trap "rm -f ${SCRIPT_DIR}/.git-askpass" EXIT

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

# ── Create and push social app ───────────────────────────────────────────────

create_repo "social" "Social media app — posts, images, auth"

# Push social app content (main branch + feature branch with PR)
push_social() {
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
  trap "rm -rf ${TMP_DIR}" RETURN

  # Copy full app (feat/markdown-posts version)
  cp -r "${SOURCE_DIR}/"* "${TMP_DIR}/" 2>/dev/null || true
  cp -r "${SOURCE_DIR}/".[!.]* "${TMP_DIR}/" 2>/dev/null || true
  # Remove build artifacts that may exist locally
  rm -rf "${TMP_DIR}/node_modules" "${TMP_DIR}/.next" "${TMP_DIR}/bun.lock"
  rm -f "${TMP_DIR}/tsconfig.tsbuildinfo"

  cd "${TMP_DIR}"
  git init -q
  git checkout -b main

  # For main branch: overlay with non-markdown versions and remove PostBody
  cp "${OVERRIDES_DIR}/page.tsx" src/app/page.tsx
  cp "${OVERRIDES_DIR}/package.json" package.json
  rm -f src/app/components/post-body.tsx

  git add .
  git -c user.name="Open Platform" -c user.email="system@${DOMAIN}" \
    commit -q -m "social media app: posts feed, image uploads, forgejo auth"
  git_push social main

  # Create feature branch with markdown additions
  git checkout -b feat/markdown-posts

  # Restore original files from source (with PostBody)
  cp "${SOURCE_DIR}/src/app/page.tsx" src/app/page.tsx
  cp "${SOURCE_DIR}/package.json" package.json
  mkdir -p src/app/components
  cp "${SOURCE_DIR}/src/app/components/post-body.tsx" src/app/components/post-body.tsx

  git add .
  git -c user.name="Open Platform" -c user.email="system@${DOMAIN}" \
    commit -q -m "feat: render post bodies as markdown"
  git_push social feat/markdown-posts

  cd "${ROOT_DIR}"
  echo "Pushed content to 'system/social' (main + feat/markdown-posts)."
}

push_social

# Wait for Forgejo to index both branches before creating PR
echo "Waiting for branches to be indexed..."
for i in $(seq 1 15); do
  MAIN_OK=$(api "${API_URL}/repos/system/social/branches/main" 2>/dev/null | jq -r '.name // empty' || echo "")
  FEAT_OK=$(api "${API_URL}/repos/system/social/branches/feat/markdown-posts" 2>/dev/null | jq -r '.name // empty' || echo "")
  if [ -n "$MAIN_OK" ] && [ -n "$FEAT_OK" ]; then
    break
  fi
  sleep 1
done

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

# ── Create and push minecraft app ────────────────────────────────────────────

create_repo "minecraft" "Minecraft server manager — create and manage servers"
push_content "minecraft" "${ROOT_DIR}/apps/minecraft"

# ── Create and push arcade app ─────────────────────────────────────────────

create_repo "arcade" "Game leaderboard platform — scores, rankings, player profiles"
push_content "arcade" "${ROOT_DIR}/apps/arcade"

# ── Create and push events app ────────────────────────────────────────────

create_repo "events" "Event planning and RSVP platform"
push_content "events" "${ROOT_DIR}/apps/events"

# ── Create and push hub app ──────────────────────────────────────────────

create_repo "hub" "Platform hub — activity feed, cross-app dashboard, user profiles"
push_content "hub" "${ROOT_DIR}/apps/hub"

echo "System org setup complete."
