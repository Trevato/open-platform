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
      echo "Error: must run from an open-platform checkout (scripts/deploy.sh not found)"
      echo ""
      echo "Quickstart:"
      echo "  git clone https://github.com/trevato/open-platform && cd open-platform"
      echo "  cp open-platform.yaml.example open-platform.yaml"
      echo "  nix run .#deploy"
      exit 1
    fi

    exec bash scripts/deploy.sh "$@"
  '';

  meta = {
    description = "Deploy Open Platform to a k3s cluster";
    mainProgram = "open-platform-deploy";
  };
}
