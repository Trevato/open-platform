{
  writeShellApplication,
  kubectl,
  kubernetes-helm,
  helmfile,
  git,
  curl,
  openssl,
  jq,
  gnused,
  gawk,
  coreutils,
  bun,
  gnumake,
  postgresql_17,
}:

writeShellApplication {
  name = "open-platform-deploy";

  runtimeInputs = [
    kubectl
    kubernetes-helm
    helmfile
    git
    curl
    openssl
    jq
    gnused
    gawk
    coreutils
    bun
    gnumake
    postgresql_17
  ];

  text = ''
    if [ ! -f scripts/deploy.sh ]; then
      CLONE_DIR="''${PWD}/open-platform"
      if [ -d "$CLONE_DIR/.git" ]; then
        echo "Updating $CLONE_DIR..."
        git -C "$CLONE_DIR" pull --ff-only
      else
        echo "Cloning open-platform to $CLONE_DIR..."
        git clone https://github.com/Trevato/open-platform "$CLONE_DIR"
      fi
      cd "$CLONE_DIR"
    fi

    exec bash scripts/deploy.sh "$@"
  '';

  meta = {
    description = "Deploy Open Platform to a k3s cluster";
    mainProgram = "open-platform-deploy";
  };
}
