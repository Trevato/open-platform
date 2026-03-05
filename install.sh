#!/usr/bin/env bash
set -euo pipefail

# Open Platform Installer
# Usage:
#   curl -fsSL https://open-platform.sh/install | bash
#   curl -fsSL https://open-platform.sh/install | bash -s -- --domain my.example.com --email admin@example.com

VERSION="0.1.0"
REPO_URL="https://github.com/trevato/open-platform.git"
INSTALL_DIR="${OPEN_PLATFORM_DIR:-/opt/open-platform}"

# ── Colors ───────────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

info()  { echo -e "${BLUE}${BOLD}::${NC} $*"; }
ok()    { echo -e "${GREEN}${BOLD}ok${NC} $*"; }
warn()  { echo -e "${YELLOW}${BOLD}!!${NC} $*"; }
fail()  { echo -e "${RED}${BOLD}error:${NC} $*"; exit 1; }

# ── Parse Arguments ──────────────────────────────────────────────────────────

DOMAIN=""
ADMIN_EMAIL=""
ADMIN_USER="opadmin"
TLS_MODE="letsencrypt"
NONINTERACTIVE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain)      DOMAIN="$2"; shift 2 ;;
    --email)       ADMIN_EMAIL="$2"; shift 2 ;;
    --user)        ADMIN_USER="$2"; shift 2 ;;
    --tls)         TLS_MODE="$2"; shift 2 ;;
    --dir)         INSTALL_DIR="$2"; shift 2 ;;
    --yes|-y)      NONINTERACTIVE=true; shift ;;
    --help|-h)
      echo "Open Platform Installer v${VERSION}"
      echo ""
      echo "Usage: install.sh [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --domain DOMAIN    Platform domain (e.g., my.example.com)"
      echo "  --email EMAIL      Admin email for TLS certs and notifications"
      echo "  --user USERNAME    Admin username (default: opadmin)"
      echo "  --tls MODE         TLS mode: letsencrypt, selfsigned, cloudflare (default: letsencrypt)"
      echo "  --dir PATH         Install directory (default: /opt/open-platform)"
      echo "  --yes, -y          Non-interactive mode (skip prompts)"
      echo "  --help, -h         Show this help"
      exit 0
      ;;
    *) fail "Unknown option: $1. Use --help for usage." ;;
  esac
done

# ── Banner ───────────────────────────────────────────────────────────────────

echo ""
echo -e "${BOLD}  Open Platform${NC} v${VERSION}"
echo -e "  Your own development platform. One command."
echo ""

# ── System Checks ────────────────────────────────────────────────────────────

info "Checking system requirements..."

# OS check
if [[ "$(uname -s)" != "Linux" ]]; then
  fail "Open Platform requires Linux. Detected: $(uname -s)"
fi

# Architecture check
ARCH=$(uname -m)
case "$ARCH" in
  x86_64|amd64) ARCH="amd64" ;;
  aarch64|arm64) ARCH="arm64" ;;
  *) fail "Unsupported architecture: ${ARCH}. Requires x86_64 or arm64." ;;
esac

# Memory check (minimum 4GB)
MEM_KB=$(grep MemTotal /proc/meminfo 2>/dev/null | awk '{print $2}')
MEM_GB=$((MEM_KB / 1024 / 1024))
if [ "$MEM_GB" -lt 3 ]; then
  warn "Low memory: ${MEM_GB}GB detected (4GB+ recommended)"
fi

# Disk check (minimum 20GB free)
DISK_AVAIL=$(df -BG /opt 2>/dev/null | tail -1 | awk '{print $4}' | tr -d 'G')
if [ "${DISK_AVAIL:-0}" -lt 20 ]; then
  warn "Low disk: ${DISK_AVAIL}GB free (20GB+ recommended)"
fi

ok "Linux ${ARCH}, ${MEM_GB}GB RAM, ${DISK_AVAIL}GB disk"

# ── Install Prerequisites ────────────────────────────────────────────────────

install_if_missing() {
  local cmd="$1" name="${2:-$1}"
  if command -v "$cmd" >/dev/null 2>&1; then
    ok "${name} $(${cmd} --version 2>/dev/null | head -1 || echo 'installed')"
    return 0
  fi
  return 1
}

info "Checking prerequisites..."

# curl (required for everything)
install_if_missing curl || fail "curl is required. Install: apt install curl"

# git
install_if_missing git || {
  info "Installing git..."
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update -qq && sudo apt-get install -y -qq git
  elif command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y git
  elif command -v pacman >/dev/null 2>&1; then
    sudo pacman -S --noconfirm git
  else
    fail "Cannot install git automatically. Install manually and re-run."
  fi
  ok "git installed"
}

# openssl
install_if_missing openssl || fail "openssl is required. Install: apt install openssl"

# ── Install k3s ──────────────────────────────────────────────────────────────

if command -v k3s >/dev/null 2>&1; then
  ok "k3s $(k3s --version 2>/dev/null | head -1 | awk '{print $3}')"
else
  info "Installing k3s..."
  curl -sfL https://get.k3s.io | sh -s - --write-kubeconfig-mode 644
  ok "k3s installed"
fi

# Ensure kubectl works
export KUBECONFIG="${KUBECONFIG:-/etc/rancher/k3s/k3s.yaml}"
if ! kubectl cluster-info >/dev/null 2>&1; then
  fail "kubectl cannot reach the cluster. Check k3s status: systemctl status k3s"
fi

# ── Install Helm ─────────────────────────────────────────────────────────────

if command -v helm >/dev/null 2>&1; then
  ok "helm $(helm version --short 2>/dev/null)"
else
  info "Installing helm..."
  curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
  ok "helm installed"
fi

# ── Install Helmfile ─────────────────────────────────────────────────────────

if command -v helmfile >/dev/null 2>&1; then
  ok "helmfile $(helmfile --version 2>/dev/null | head -1)"
else
  info "Installing helmfile..."
  HELMFILE_VERSION=$(curl -sSL https://api.github.com/repos/helmfile/helmfile/releases/latest | grep tag_name | cut -d'"' -f4)
  curl -fsSL "https://github.com/helmfile/helmfile/releases/download/${HELMFILE_VERSION}/helmfile_${HELMFILE_VERSION#v}_linux_${ARCH}.tar.gz" | sudo tar xz -C /usr/local/bin helmfile
  sudo chmod +x /usr/local/bin/helmfile
  ok "helmfile installed"
fi

# helm-diff plugin
if helm plugin list 2>/dev/null | grep -q diff; then
  ok "helm-diff plugin"
else
  info "Installing helm-diff plugin..."
  helm plugin install https://github.com/databus23/helm-diff
  ok "helm-diff plugin installed"
fi

# ── Interactive Prompts ──────────────────────────────────────────────────────

if [ -z "$DOMAIN" ]; then
  if [ "$NONINTERACTIVE" = true ]; then
    fail "--domain is required in non-interactive mode"
  fi
  echo ""
  read -rp "$(echo -e "${BLUE}${BOLD}?${NC} Platform domain (e.g., my.example.com): ")" DOMAIN
  [ -z "$DOMAIN" ] && fail "Domain is required"
fi

if [ -z "$ADMIN_EMAIL" ]; then
  if [ "$NONINTERACTIVE" = true ]; then
    ADMIN_EMAIL="admin@${DOMAIN}"
  else
    read -rp "$(echo -e "${BLUE}${BOLD}?${NC} Admin email [admin@${DOMAIN}]: ")" ADMIN_EMAIL
    ADMIN_EMAIL="${ADMIN_EMAIL:-admin@${DOMAIN}}"
  fi
fi

if [ "$NONINTERACTIVE" != true ]; then
  read -rp "$(echo -e "${BLUE}${BOLD}?${NC} Admin username [${ADMIN_USER}]: ")" input
  ADMIN_USER="${input:-${ADMIN_USER}}"
fi

# ── Clone Repository ─────────────────────────────────────────────────────────

info "Setting up Open Platform in ${INSTALL_DIR}..."

if [ -d "${INSTALL_DIR}/.git" ]; then
  info "Updating existing installation..."
  git -C "$INSTALL_DIR" pull --ff-only 2>/dev/null || true
else
  sudo mkdir -p "$(dirname "$INSTALL_DIR")"
  sudo git clone "$REPO_URL" "$INSTALL_DIR"
  sudo chown -R "$(id -u):$(id -g)" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# ── Write Config ─────────────────────────────────────────────────────────────

info "Writing configuration..."

cat > open-platform.yaml <<EOF
domain: ${DOMAIN}

admin:
  username: ${ADMIN_USER}
  email: ${ADMIN_EMAIL}

tls:
  mode: ${TLS_MODE}
  email: ${ADMIN_EMAIL}
EOF

ok "open-platform.yaml"

# ── Generate Config + Deploy ─────────────────────────────────────────────────

info "Generating config..."
./scripts/generate-config.sh

echo ""
info "Deploying Open Platform..."
echo ""

make deploy

# ── Done ─────────────────────────────────────────────────────────────────────

SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo '<server-ip>')

echo ""
echo -e "${GREEN}${BOLD}Open Platform is running!${NC}"
echo ""
echo "Services:"
echo "  Forgejo:    https://forgejo.${DOMAIN}"
echo "  Woodpecker: https://ci.${DOMAIN}"
echo "  Headlamp:   https://headlamp.${DOMAIN}"
echo "  MinIO:      https://minio.${DOMAIN}"
echo ""
echo -e "${YELLOW}DNS:${NC} Point *.${DOMAIN} to ${SERVER_IP}"
echo ""
echo "Admin credentials are in: ${INSTALL_DIR}/.env"
echo "Update: cd ${INSTALL_DIR} && git pull && make deploy"
echo ""
