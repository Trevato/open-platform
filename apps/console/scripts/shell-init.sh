#!/bin/sh
# Shell environment for web terminal sessions
# Shell environment for dev pod web terminals

# ─── History ───
HISTSIZE=50000
SAVEHIST=50000
HISTFILE=$HOME/.zsh_history
setopt HIST_IGNORE_DUPS
setopt HIST_IGNORE_ALL_DUPS
setopt HIST_IGNORE_SPACE
setopt EXTENDED_HISTORY
setopt SHARE_HISTORY

# ─── Keybindings ───
bindkey '^[[A' history-search-backward
bindkey '^[[B' history-search-forward

# ─── Git Aliases ───
alias g='git'
alias gs='git status'
alias gd='git diff'
alias gds='git diff --staged'
alias ga='git add'
alias gc='git commit'
alias gp='git push'
alias gl='git pull'
alias gco='git checkout'
alias gcb='git checkout -b'
alias glog='git log --oneline --graph --decorate -20'

# ─── Kubernetes Aliases ───
alias k='kubectl'
alias kgp='kubectl get pods'
alias kgs='kubectl get svc'
alias kga='kubectl get all'
alias kns='kubectl config set-context --current --namespace'
alias h='helm'
alias ks='kustomize'
alias lzk='k9s'

# ─── Quick Aliases ───
alias v='nvim'
alias ..='cd ..'
alias ...='cd ../..'

# ─── bat ───
export BAT_THEME="Catppuccin Mocha"
if command -v bat >/dev/null 2>&1; then
  alias cat='bat --paging=never'
fi

# ─── eza (ls replacement) ───
if command -v eza >/dev/null 2>&1; then
  alias ls='eza --icons=auto --git'
  alias ll='eza --icons=auto --git -la'
  alias la='eza --icons=auto --git -a'
  alias lt='eza --icons=auto --git --tree --level=2'
else
  alias ll='ls -la'
  alias la='ls -a'
fi

# ─── fzf ───
export FZF_DEFAULT_OPTS="--height 40% --border"
[ -f /usr/share/fzf/key-bindings.zsh ] && source /usr/share/fzf/key-bindings.zsh
[ -f /usr/share/fzf/completion.zsh ] && source /usr/share/fzf/completion.zsh

# ─── Tool Configs ───
export STARSHIP_CONFIG=/app/scripts/starship.toml
export K9S_CONFIG_DIR=/app/scripts/k9s
export GIT_CONFIG_GLOBAL=/app/scripts/gitconfig

# ─── btop ───
mkdir -p "$HOME/.config/btop" 2>/dev/null
[ ! -f "$HOME/.config/btop/btop.conf" ] && \
  cp /app/scripts/btop.conf "$HOME/.config/btop/btop.conf" 2>/dev/null

# ─── Zsh Plugins ───
[ -f /usr/share/zsh/plugins/zsh-autosuggestions/zsh-autosuggestions.zsh ] && \
  source /usr/share/zsh/plugins/zsh-autosuggestions/zsh-autosuggestions.zsh

# Syntax highlighting must be sourced last
[ -f /usr/share/zsh/plugins/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh ] && \
  source /usr/share/zsh/plugins/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh

# ─── Starship Prompt ───
if command -v starship >/dev/null 2>&1; then
  eval "$(starship init zsh)"
fi

# ─── Welcome ───
echo ""
echo "  \033[1mTools:\033[0m kubectl (k), k9s, helm, nvim (v), bat, fzf, eza"
echo ""
echo "  \033[2mQuick start\033[0m"
echo "    k get pods -A          all pods across namespaces"
echo "    kgp -n forgejo          pods in a specific namespace"
echo "    k9s                    interactive cluster dashboard"
echo "    k logs -n NS POD       view pod logs"
echo "    k exec -n NS POD -- sh shell into a pod"
echo "    h list -A              all helm releases"
echo ""
