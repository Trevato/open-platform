#!/bin/sh
# Shell environment for web terminal sessions

# Aliases
alias k='kubectl'
alias v='nvim'
alias lzk='k9s'
alias ll='ls -la'
alias la='ls -a'

# bat as cat replacement (if available)
if command -v bat >/dev/null 2>&1; then
  alias cat='bat --paging=never'
fi

# Starship prompt
if command -v starship >/dev/null 2>&1; then
  eval "$(starship init zsh)"
fi

# History
HISTSIZE=5000
SAVEHIST=5000
HISTFILE=$HOME/.zsh_history
setopt HIST_IGNORE_DUPS SHARE_HISTORY

# Welcome
echo ""
echo "  \033[1mTools:\033[0m kubectl (k), k9s, helm, nvim (v), bat"
echo ""
echo "  \033[2mQuick start\033[0m"
echo "    k get pods -A          all pods across namespaces"
echo "    k get pods -n forgejo  pods in a specific namespace"
echo "    k9s                    interactive cluster dashboard"
echo "    k logs -n NS POD       view pod logs"
echo "    k exec -n NS POD -- sh shell into a pod"
echo "    helm list -A           all helm releases"
echo ""
