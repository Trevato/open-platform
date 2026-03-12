#!/bin/bash
set -e

# =============================================================================
# DevPod Init — runs on every boot
# Handles PVC mount covering home-manager symlinks
# =============================================================================

# Phase 0: Suppress zsh new-user wizard and provide a usable shell immediately
# PVC mount at /home/dev is empty on first boot — create a .zshrc that waits
# for home-manager to finish, then sources the real config. HM will overwrite
# this file with its generated version once activation completes.
if [ ! -f "$HOME/.zshrc" ]; then
  cat > "$HOME/.zshrc" << 'ZSHRC'
# Temporary shell config — waiting for home-manager to activate.
# This file is replaced automatically once setup completes.
if [ ! -f "$HOME/.hm-ready" ]; then
  printf '\033[0;33m⏳ Setting up your environment...\033[0m'
  while [ ! -f "$HOME/.hm-ready" ]; do sleep 1; done
  printf '\r\033[K'
  # Reload with the real config
  exec zsh --login
fi
ZSHRC
fi

# Phase 1: Re-activate home-manager symlinks over PVC mount
# The Nix store lives in the image at /nix/store, but home-manager symlinks
# in /home/dev were covered when the PVC mounted over it.
# The PVC also covers ~/.nix-profile, so use the stable symlink or find in store.
NIX_BIN="/usr/local/bin/nix"
[ -x "$NIX_BIN" ] || NIX_BIN=$(find /nix/store -maxdepth 2 -name nix -path '*/bin/nix' -type f 2>/dev/null | sort | tail -1)
if [ -n "$NIX_BIN" ] && [ -d /tmp/devpod ]; then
  echo "[init] Phase 1: Activating home-manager environment (via $NIX_BIN)..."
  NIX_DIR=$(dirname "$(readlink -f "$NIX_BIN")")

  # PVC mount covers ~/.nix-profile and ~/.local/state — recreate what HM needs
  mkdir -p "$HOME/.local/state/nix/profiles" "$HOME/.local/state/home-manager"
  mkdir -p /nix/var/nix/profiles/per-user/dev
  export PATH="$NIX_DIR:$PATH"

  "$NIX_BIN" run \
    --extra-experimental-features "nix-command flakes" \
    home-manager -- switch --flake /tmp/devpod#dev -b backup 2>&1 || true

  # After HM switch, ensure PATH includes the new profile
  [ -d "$HOME/.nix-profile/bin" ] && export PATH="$HOME/.nix-profile/bin:$PATH"
fi

# Signal that home-manager is ready — the skeleton .zshrc waits for this
touch "$HOME/.hm-ready"

# Phase 2: Git credentials (every boot — env vars may change)
echo "[init] Phase 2: Configuring git credentials..."
git config --global user.name "${FORGEJO_FULL_NAME:-dev}"
git config --global user.email "${FORGEJO_EMAIL:-dev@localhost}"

if [ -n "$FORGEJO_TOKEN" ] && [ -n "$FORGEJO_URL" ]; then
  FORGEJO_HOST=$(echo "$FORGEJO_URL" | sed 's|https\?://||')
  git config --global credential.helper store
  echo "https://${FORGEJO_USERNAME}:${FORGEJO_TOKEN}@${FORGEJO_HOST}" > "$HOME/.git-credentials"
  chmod 600 "$HOME/.git-credentials"
  echo "[init] Phase 2: Credentials configured for ${FORGEJO_USERNAME}@${FORGEJO_HOST}"
else
  echo "[init] Phase 2: WARNING — FORGEJO_TOKEN or FORGEJO_URL not set, skipping credentials"
fi

# SSL handling for self-signed certs
if [ -f /etc/ssl/custom/ca.crt ]; then
  git config --global http.sslCAInfo /etc/ssl/custom/ca.crt
  echo "[init] Phase 2: Using custom CA certificate"
fi
export GIT_SSL_NO_VERIFY="${GIT_SSL_NO_VERIFY:-0}"

# Phase 3: First-boot only — clone repos, setup MCP
if [ ! -f "$HOME/.devpod-initialized" ]; then
  echo "[init] Phase 3: First boot setup..."

  if [ -n "$FORGEJO_TOKEN" ] && [ -n "$FORGEJO_URL" ]; then
    mkdir -p "$HOME/projects"

    # Fetch repos via Forgejo API
    echo "[init] Phase 3: Fetching repos from ${FORGEJO_URL}..."
    REPO_JSON=$(curl -sk -H "Authorization: token ${FORGEJO_TOKEN}" \
      "${FORGEJO_URL}/api/v1/user/repos?limit=50" 2>&1)
    REPOS=$(echo "$REPO_JSON" | jq -r '.[] | .clone_url' 2>/dev/null || true)
    REPO_COUNT=$(echo "$REPOS" | grep -c 'http' 2>/dev/null || echo 0)
    echo "[init] Phase 3: Found ${REPO_COUNT} repos to clone"

    for repo_url in $REPOS; do
      name=$(basename "$repo_url" .git)
      if [ ! -d "$HOME/projects/$name" ]; then
        echo "[init] Phase 3: Cloning ${name}..."
        if ! git clone "$repo_url" "$HOME/projects/$name" 2>&1; then
          echo "[init] Phase 3: WARNING — Failed to clone ${name}"
        fi
      fi
    done
  else
    echo "[init] Phase 3: WARNING — FORGEJO_TOKEN or FORGEJO_URL not set, skipping repo clone"
  fi

  # MCP config for Claude Code (platform API)
  if [ -n "$OP_API_URL" ]; then
    mkdir -p "$HOME/.claude"
    cat > "$HOME/.claude/.mcp.json" << MCPEOF
{
  "mcpServers": {
    "open-platform": {
      "type": "streamable-http",
      "url": "${OP_API_URL}/mcp",
      "headers": {
        "Authorization": "Bearer ${FORGEJO_TOKEN}"
      }
    }
  }
}
MCPEOF
  fi

  touch "$HOME/.devpod-initialized"
fi

# Phase 4: Auto-fetch daemon (background, every 5 minutes)
echo "[init] Phase 4: Starting auto-fetch daemon..."
(
  while true; do
    sleep 300
    for dir in "$HOME"/projects/*/; do
      [ -d "$dir/.git" ] && git -C "$dir" fetch --all --quiet 2>/dev/null || true
    done
  done
) &

echo "[init] Ready."
exec "$@"
