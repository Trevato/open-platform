{
  config,
  lib,
  pkgs,
  ...
}:

let
  cfg = config.services.open-platform;
  isHA = cfg.clusterInit || cfg.serverAddr != "";
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
        default = [ "traefik" ] ++ lib.optionals (cfg.network.mode == "loadbalancer") [ "servicelb" ];
        description = "k3s components to disable. Traefik is managed by Helm. servicelb disabled when using MetalLB.";
      };

      extraFlags = lib.mkOption {
        type = lib.types.listOf lib.types.str;
        default = [ ];
        description = "Additional k3s server flags.";
      };

    };

    network = {
      mode = lib.mkOption {
        type = lib.types.enum [
          "host"
          "loadbalancer"
        ];
        default = "host";
        description = "Traefik networking: 'host' (DaemonSet+hostNetwork) or 'loadbalancer' (MetalLB L2 VIP).";
      };

      edgeInterface = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        description = "NIC for MetalLB L2 advertisements (e.g., eno3 for VLAN 101).";
      };
    };

    role = lib.mkOption {
      type = lib.types.enum [
        "server"
        "agent"
      ];
      default = "server";
      description = "k3s role: 'server' (control plane) or 'agent' (worker).";
    };

    clusterInit = lib.mkOption {
      type = lib.types.bool;
      default = false;
      description = "Initialize HA cluster with embedded etcd. Only the first server sets this.";
    };

    serverAddr = lib.mkOption {
      type = lib.types.str;
      default = "";
      description = "k3s server address for joining nodes (e.g., https://10.0.0.44:6443). Required for agents and additional servers.";
    };

    tokenFile = lib.mkOption {
      type = lib.types.nullOr lib.types.path;
      default = null;
      description = "Path to file containing the k3s node join token.";
    };

    nodeExternalIp = lib.mkOption {
      type = lib.types.nullOr lib.types.str;
      default = null;
      description = "External IP for this node (e.g., Tailscale IP). Required for cross-node Flannel VXLAN.";
    };

    tlsSans = lib.mkOption {
      type = lib.types.listOf lib.types.str;
      default = [ ];
      description = "Additional TLS SANs for the k3s API server certificate (Tailscale IPs, LAN IPs, DNS names).";
    };

    maxPods = lib.mkOption {
      type = lib.types.nullOr lib.types.int;
      default = null;
      description = "Maximum pods per node. k3s default is 110. Set to 250 for dense deployments.";
    };

    clusterCidr = lib.mkOption {
      type = lib.types.str;
      default = "10.42.0.0/16";
      description = "Pod network CIDR.";
    };

    serviceCidr = lib.mkOption {
      type = lib.types.str;
      default = "10.43.0.0/16";
      description = "Service network CIDR.";
    };

    nodeCidrMaskSize = lib.mkOption {
      type = lib.types.nullOr lib.types.int;
      default = null;
      description = "Per-node CIDR mask size. Default 24; use 20 for high-pod-density nodes.";
    };

    registryCaFile = lib.mkOption {
      type = lib.types.nullOr lib.types.path;
      default = null;
      description = "Path to platform CA cert for containerd registry pulls (self-signed TLS).";
    };

    registryAuth = {
      username = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        description = "Username for Forgejo container registry.";
      };

      passwordFile = lib.mkOption {
        type = lib.types.nullOr lib.types.path;
        default = null;
        description = "Path to file containing registry password (kept out of Nix store).";
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

    # --- Assertions for HA configuration ---
    assertions = [
      {
        assertion = !(cfg.clusterInit && cfg.serverAddr != "");
        message = "open-platform: clusterInit and serverAddr are mutually exclusive. First server uses clusterInit; joining servers use serverAddr.";
      }
      {
        assertion = cfg.role == "server" || cfg.serverAddr != "";
        message = "open-platform: agent role requires serverAddr to be set.";
      }
      {
        assertion = !(cfg.clusterInit && cfg.role == "agent");
        message = "open-platform: clusterInit cannot be used with agent role.";
      }
    ];

    # --- k3s (role-aware: server or agent) ---
    services.k3s = {
      enable = true;
      role = cfg.role;
      serverAddr = lib.mkIf (cfg.serverAddr != "") cfg.serverAddr;
      tokenFile = lib.mkIf (cfg.tokenFile != null) cfg.tokenFile;
      extraFlags =
        let
          disableFlags = map (c: "--disable ${c}") cfg.k3s.disable;
          flannelFlags = lib.optionals (cfg.flannel.externalIp || cfg.nodeExternalIp != null) [
            "--flannel-external-ip"
          ];
          externalIpFlags = lib.optionals (cfg.nodeExternalIp != null) [
            "--node-external-ip=${cfg.nodeExternalIp}"
          ];
          cidrFlags = [
            "--cluster-cidr=${cfg.clusterCidr}"
            "--service-cidr=${cfg.serviceCidr}"
          ]
          ++ lib.optionals (cfg.nodeCidrMaskSize != null) [
            "--kube-controller-manager-arg=node-cidr-mask-size=${toString cfg.nodeCidrMaskSize}"
          ];
          tlsSanFlags = map (san: "--tls-san=${san}") cfg.tlsSans;
          maxPodsFlags = lib.optionals (cfg.maxPods != null) [
            "--kubelet-arg=max-pods=${toString cfg.maxPods}"
          ];
          clusterInitFlags = lib.optionals cfg.clusterInit [
            "--cluster-init"
          ];
          serverFlags =
            disableFlags
            ++ flannelFlags
            ++ externalIpFlags
            ++ cidrFlags
            ++ tlsSanFlags
            ++ maxPodsFlags
            ++ clusterInitFlags
            ++ cfg.k3s.extraFlags;
          agentFlags = externalIpFlags ++ maxPodsFlags ++ cfg.k3s.extraFlags;
        in
        if cfg.role == "server" then serverFlags else agentFlags;
    };

    # --- IPAM wipe on start (prevents stale CNI allocations) ---
    systemd.services.k3s.serviceConfig.ExecStartPre = lib.mkBefore (
      pkgs.writeShellScript "k3s-ipam-wipe" ''
        rm -f /var/lib/cni/networks/cbr0/* 2>/dev/null || true
      ''
    );

    # --- k3s registry config (trust self-signed CA + optional auth for container pulls) ---
    systemd.services.k3s-registry-config =
      let
        caFile = cfg.registryCaFile;
        registryTemplate = pkgs.writeText "registries-yaml-template" (
          lib.concatStringsSep "\n" (
            [
              "mirrors:"
              "  forgejo.${cfg.domain}:"
              "    endpoint:"
              "      - \"https://forgejo.${cfg.domain}\""
              "configs:"
              "  \"forgejo.${cfg.domain}\":"
              "    auth:"
              "      username: \"${cfg.registryAuth.username}\""
              "      password: __REGISTRY_PASSWORD__"
            ]
            ++ lib.optionals (caFile != null) [
              "    tls:"
              "      ca_file: \"${caFile}\""
            ]
            ++ [ "" ]
          )
        );
      in
      lib.mkIf (cfg.registryAuth.username != null && cfg.registryAuth.passwordFile != null) {
        description = "Generate k3s registries.yaml with registry auth";
        wantedBy = [ "k3s.service" ];
        before = [ "k3s.service" ];
        after = [ "network-online.target" ];
        wants = [ "network-online.target" ];
        serviceConfig = {
          Type = "oneshot";
          RemainAfterExit = true;
          ExecStart = pkgs.writeShellScript "gen-registries-yaml" ''
            REGISTRY_PASSWORD="$(cat ${cfg.registryAuth.passwordFile})"
            mkdir -p /etc/rancher/k3s
            ${pkgs.gnused}/bin/sed "s|__REGISTRY_PASSWORD__|$REGISTRY_PASSWORD|" \
              ${registryTemplate} > /etc/rancher/k3s/registries.yaml
          '';
        };
      };

    environment.etc."rancher/k3s/registries.yaml" =
      lib.mkIf (cfg.registryCaFile != null && cfg.registryAuth.username == null)
        {
          text = ''
            mirrors:
              forgejo.${cfg.domain}:
                endpoint:
                  - "https://forgejo.${cfg.domain}"
            configs:
              "forgejo.${cfg.domain}":
                tls:
                  ca_file: "${cfg.registryCaFile}"
          '';
        };

    # --- System packages ---
    environment.systemPackages = with pkgs; [
      kubectl
      kubernetes-helm
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
        10250 # kubelet metrics
      ]
      ++ lib.optionals isHA [
        2379 # etcd client
        2380 # etcd peer
      ]
      ++ lib.optionals (cfg.network.mode == "loadbalancer") [
        7472 # MetalLB metrics
        7946 # MetalLB memberlist
      ];
      allowedUDPPorts = [
        8472 # Flannel VXLAN
      ]
      ++ lib.optionals (cfg.network.mode == "loadbalancer") [
        7946 # MetalLB memberlist
      ];
      trustedInterfaces = [
        "cni0"
        "flannel.1"
      ];
    };

  };
}
