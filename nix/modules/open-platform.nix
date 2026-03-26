{
  config,
  lib,
  pkgs,
  ...
}:

let
  cfg = config.services.open-platform;
in
{
  options.services.open-platform = {
    enable = lib.mkEnableOption "Open Platform k3s deployment";

    domain = lib.mkOption {
      type = lib.types.str;
      description = "Platform domain (e.g., open-platform.sh).";
    };

    installDir = lib.mkOption {
      type = lib.types.path;
      default = /opt/open-platform;
      description = "Directory containing the open-platform checkout.";
    };

    k3s = {
      disable = lib.mkOption {
        type = lib.types.listOf lib.types.str;
        default = [ "traefik" ];
        description = "k3s components to disable. Traefik is managed by Helm.";
      };

      extraFlags = lib.mkOption {
        type = lib.types.listOf lib.types.str;
        default = [ ];
        description = "Additional k3s server flags.";
      };

      oidc = {
        enable = lib.mkOption {
          type = lib.types.bool;
          default = false;
          description = ''
            Enable OIDC flags for Headlamp authentication.
            Set this after first deploy once Forgejo is running and
            the Headlamp OIDC client ID is available.
          '';
        };

        clientId = lib.mkOption {
          type = lib.types.str;
          default = "";
          description = ''
            Headlamp OIDC client ID. Retrieve after first deploy:
            kubectl get secret oidc -n headlamp -o jsonpath='{.data.OIDC_CLIENT_ID}' | base64 -d
          '';
        };

        caFile = lib.mkOption {
          type = lib.types.nullOr lib.types.path;
          default = null;
          description = "Path to CA cert for OIDC issuer verification (self-signed TLS only).";
        };
      };
    };

    flannel = {
      externalIp = lib.mkOption {
        type = lib.types.bool;
        default = false;
        description = "Use --flannel-external-ip for cross-node networking over Tailscale.";
      };
    };

    tailscale = {
      enable = lib.mkOption {
        type = lib.types.bool;
        default = false;
        description = "Enable Tailscale for cross-node connectivity.";
      };
    };

    firewall = {
      enable = lib.mkOption {
        type = lib.types.bool;
        default = true;
        description = "Configure firewall rules for k3s and platform services.";
      };
    };
  };

  config = lib.mkIf cfg.enable {

    # --- k3s server ---
    services.k3s = {
      enable = true;
      role = "server";
      extraFlags =
        let
          disableFlags = map (c: "--disable ${c}") cfg.k3s.disable;
          flannelFlags = lib.optionals cfg.flannel.externalIp [
            "--flannel-external-ip"
          ];
          oidcFlags =
            lib.optionals (cfg.k3s.oidc.enable && cfg.k3s.oidc.clientId != "") [
              "--kube-apiserver-arg=oidc-issuer-url=https://forgejo.${cfg.domain}"
              "--kube-apiserver-arg=oidc-client-id=${cfg.k3s.oidc.clientId}"
              "--kube-apiserver-arg=oidc-username-claim=preferred_username"
              "--kube-apiserver-arg=oidc-username-prefix=-"
              "--kube-apiserver-arg=oidc-groups-claim=groups"
            ]
            ++ lib.optionals (cfg.k3s.oidc.caFile != null) [
              "--kube-apiserver-arg=oidc-ca-file=${cfg.k3s.oidc.caFile}"
            ];
        in
        disableFlags ++ flannelFlags ++ oidcFlags ++ cfg.k3s.extraFlags;
    };

    # --- System packages ---
    environment.systemPackages = with pkgs; [
      kubectl
      kubernetes-helm
      helmfile
      git
      curl
      openssl
      jq
      gnused
      gawk
      bun
      gnumake
    ];

    # --- Docker ---
    virtualisation.docker.enable = true;

    # --- Tailscale ---
    services.tailscale.enable = lib.mkIf cfg.tailscale.enable true;

    # --- Firewall ---
    networking.firewall = lib.mkIf cfg.firewall.enable {
      enable = true;
      allowedTCPPorts = [
        80 # HTTP (Traefik hostNetwork)
        443 # HTTPS (Traefik hostNetwork)
        6443 # k3s API server
      ];
      allowedUDPPorts = [
        8472 # Flannel VXLAN
      ];
      trustedInterfaces = [
        "cni0"
        "flannel.1"
      ];
    };

    # --- helm-diff plugin (idempotent oneshot) ---
    systemd.services.helm-diff-install = {
      description = "Install helm-diff plugin for helmfile";
      wantedBy = [ "multi-user.target" ];
      after = [ "network-online.target" ];
      wants = [ "network-online.target" ];
      path = [
        pkgs.git
        pkgs.bash
        pkgs.coreutils
        pkgs.gnutar
        pkgs.gzip
      ];
      serviceConfig = {
        Type = "oneshot";
        RemainAfterExit = true;
        ExecStart = pkgs.writeShellScript "install-helm-diff" ''
          export HOME=/root
          if ! ${pkgs.kubernetes-helm}/bin/helm plugin list 2>/dev/null | grep -q diff; then
            ${pkgs.kubernetes-helm}/bin/helm plugin install https://github.com/databus23/helm-diff
          fi
        '';
      };
    };
  };
}
