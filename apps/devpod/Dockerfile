# =============================================================================
# Open Platform DevPod
# Nix + home-manager + nixvim developer environment for containers
# =============================================================================

# =============================================================================
# op-cli build stage
# =============================================================================

FROM oven/bun:1 AS op-cli
COPY tools/op-cli /build
WORKDIR /build
RUN bun install --frozen-lockfile && bun build --compile src/index.ts --outfile dist/op

# =============================================================================
# DevPod image
# =============================================================================

FROM ubuntu:24.04 AS base

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8

# Core dependencies for Nix and the build
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
      xz-utils \
      sudo \
      git \
      zsh \
    && rm -rf /var/lib/apt/lists/*

# Create dev user (uid/gid 1000 — may already exist in ubuntu:24.04)
RUN if getent group 1000 >/dev/null; then \
      groupmod -n dev "$(getent group 1000 | cut -d: -f1)"; \
    else \
      groupadd -g 1000 dev; \
    fi \
    && if id -u 1000 >/dev/null 2>&1; then \
      usermod -l dev -d /home/dev -m -s /usr/bin/zsh "$(id -nu 1000)"; \
    else \
      useradd -m -u 1000 -g dev -s /usr/bin/zsh dev; \
    fi \
    && echo "dev ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/dev

# =============================================================================
# Nix installation (single-user mode for containers)
# =============================================================================

# Create /nix owned by dev so single-user install works without root
RUN mkdir -m 0755 /nix && chown dev:dev /nix

USER dev
ENV HOME=/home/dev
ENV USER=dev
ENV NIX_CONFIG="experimental-features = nix-command flakes"

# Install Nix in single-user mode (no daemon — correct for containers)
RUN curl -L https://nixos.org/nix/install | sh -s -- --no-daemon

# Add Nix to PATH for subsequent RUN commands
ENV PATH="${HOME}/.nix-profile/bin:/nix/var/nix/profiles/default/bin:${PATH}"

# =============================================================================
# Home Manager + nixvim environment build
# =============================================================================

# Copy flake and config files (including nixvim)
COPY --chown=dev:dev flake.nix /tmp/devpod/flake.nix
COPY --chown=dev:dev home.nix /tmp/devpod/home.nix
COPY --chown=dev:dev nixvim.nix /tmp/devpod/nixvim.nix
COPY --chown=dev:dev config/ /tmp/devpod/config/

WORKDIR /tmp/devpod

# Generate flake.lock and build the home-manager configuration
RUN nix run home-manager -- switch --flake .#dev -b backup

# =============================================================================
# Claude Code (via Node.js)
# =============================================================================

# Install Node 20 via Nix
RUN nix profile install nixpkgs#nodejs_20

# Create stable node/npm symlinks outside /home/dev (PVC covers ~/.nix-profile)
RUN sudo ln -sf $(readlink -f $(which node)) /usr/local/bin/node \
    && sudo ln -sf $(readlink -f $(which npm)) /usr/local/bin/npm \
    && sudo ln -sf $(readlink -f $(which npx)) /usr/local/bin/npx

# Set npm global prefix outside /home/dev (PVC mount covers it)
RUN sudo mkdir -p /opt/npm-global && sudo chown dev:dev /opt/npm-global \
    && npm config set prefix /opt/npm-global
ENV PATH="/opt/npm-global/bin:${PATH}"

# Install claude-code globally
RUN npm install -g @anthropic-ai/claude-code

# =============================================================================
# op-cli
# =============================================================================

COPY --from=op-cli /build/dist/op /usr/local/bin/op

# =============================================================================
# Final setup
# =============================================================================

# Ensure zsh is default shell
RUN sudo chsh -s /usr/bin/zsh dev

# Create stable nix symlink outside /home/dev (PVC covers ~/.nix-profile)
# Resolve to actual store path so it survives PVC mount
RUN sudo ln -sf $(readlink -f $(which nix)) /usr/local/bin/nix \
    && sudo mkdir -p /nix/var/nix/profiles/per-user/dev \
    && sudo chown dev:dev /nix/var/nix/profiles/per-user/dev

# Copy init script
COPY --chown=dev:dev init.sh /opt/devpod/init.sh
RUN chmod +x /opt/devpod/init.sh

# Keep /tmp/devpod for runtime home-manager re-activation (PVC covers symlinks)
# Clean up Nix store garbage (skip optimise — hard links fail in Kaniko)
RUN nix store gc

WORKDIR /home/dev
USER dev

ENTRYPOINT ["/opt/devpod/init.sh"]
CMD ["sleep", "infinity"]
