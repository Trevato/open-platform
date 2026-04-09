{ pkgs, op-cli }:

pkgs.mkShell {
  name = "open-platform";

  packages =
    with pkgs;
    [
      # Kubernetes
      kubectl
      kubernetes-helm
      kustomize
      k9s

      # Core
      git
      curl
      openssl
      jq
      gnused
      gawk
      coreutils

      # JavaScript / TypeScript
      bun

      # Database (psql client for provisioner scripts)
      postgresql_17

      # Platform CLI
      op-cli
    ]
    ++ lib.optionals stdenv.isDarwin [
      colima
    ];

  shellHook = ''
    # CA trust reminder for macOS with self-signed certs
    if [ -f certs/ca.crt ] && [ "$(uname)" = "Darwin" ]; then
      if ! security find-certificate -a -c "Open Platform" /Library/Keychains/System.keychain &>/dev/null 2>&1; then
        printf '\n  \033[33mSelf-signed CA not trusted.\033[0m Run once:\n'
        printf '  sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain certs/ca.crt\n\n'
      fi
    fi

    export KUBECONFIG="''${KUBECONFIG:-$HOME/.kube/config}"
  '';
}
