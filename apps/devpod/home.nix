{ pkgs, ... }:
{
  home.stateVersion = "25.11";
  home.username = "dev";
  home.homeDirectory = "/home/dev";

  # --- Packages -----------------------------------------------------------
  home.packages = with pkgs; [
    # Core tools
    ripgrep
    fd
    tree
    jq
    yq-go
    curl
    wget
    openssh
    gnumake
    gcc

    # Kubernetes
    kubectl
    k9s
    helm

    # Languages / runtimes
    bun
    uv

    # Git ecosystem
    git
    gh
    lazygit
    lazydocker

    # Terminal multiplexer + file manager
    zellij
    yazi

    # Browser (for Playwright MCP)
    chromium

    # Formatters (for nixvim conform-nvim)
    prettierd
    stylua
    nixfmt-rfc-style

    # Fonts (Nerd Font glyphs for terminal icons)
    nerd-fonts.fira-code
    nerd-fonts.symbols-only
  ];

  # --- Shell (zsh) ---------------------------------------------------------
  programs.zsh = {
    enable = true;
    autosuggestion.enable = true;
    syntaxHighlighting.enable = true;

    history = {
      size = 50000;
      save = 50000;
      ignoreDups = true;
      ignoreAllDups = true;
      ignoreSpace = true;
      extended = true;
      share = true;
    };

    shellAliases = {
      # Git
      g = "git";
      gs = "git status";
      gd = "git diff";
      gds = "git diff --staged";
      ga = "git add";
      gc = "git commit";
      gp = "git push";
      gl = "git pull";
      gco = "git checkout";
      gcb = "git checkout -b";
      glog = "git log --oneline --graph --decorate -20";

      # Docker
      d = "docker";
      dc = "docker compose";
      dps = "docker ps";
      lzd = "lazydocker";

      # Kubernetes
      k = "kubectl";
      kgp = "kubectl get pods";
      kgs = "kubectl get svc";
      kga = "kubectl get all";
      kns = "kubectl config set-context --current --namespace";
      h = "helm";
      lzk = "k9s";

      # Quick
      v = "nvim";
      lg = "lazygit";
      y = "yazi";
      ".." = "cd ..";
      "..." = "cd ../..";
    };

    initContent = ''
      bindkey '^[[A' history-search-backward
      bindkey '^[[B' history-search-forward
    '';
  };

  # --- Starship prompt -----------------------------------------------------
  programs.starship = {
    enable = true;
    enableZshIntegration = true;
    settings = builtins.fromTOML (builtins.readFile ./config/starship.toml);
  };

  # --- fzf -----------------------------------------------------------------
  programs.fzf = {
    enable = true;
    enableZshIntegration = true;
    defaultOptions = [
      "--height 40%"
      "--border"
      "--color=bg+:#313244,bg:#1e1e2e,spinner:#f5e0dc,hl:#f38ba8"
      "--color=fg:#cdd6f4,header:#f38ba8,info:#cba6f7,pointer:#f5e0dc"
      "--color=marker:#b4befe,fg+:#cdd6f4,prompt:#cba6f7,hl+:#f38ba8"
      "--color=selected-bg:#45475a"
    ];
  };

  # --- zoxide --------------------------------------------------------------
  programs.zoxide = {
    enable = true;
    enableZshIntegration = true;
  };

  # --- eza -----------------------------------------------------------------
  programs.eza = {
    enable = true;
    enableZshIntegration = true;
    icons = "auto";
    git = true;
  };

  # --- bat -----------------------------------------------------------------
  programs.bat = {
    enable = true;
    config.theme = "Catppuccin Mocha";
  };

  # --- fd ------------------------------------------------------------------
  programs.fd.enable = true;

  # --- delta ---------------------------------------------------------------
  programs.delta = {
    enable = true;
    enableGitIntegration = true;
    options = {
      navigate = true;
      side-by-side = true;
      line-numbers = true;
      features = "catppuccin-mocha";

      catppuccin-mocha = {
        dark = true;
        syntax-theme = "Catppuccin Mocha";
        minus-style = "syntax #493447";
        minus-emph-style = "bold syntax #694559";
        plus-style = "syntax #394545";
        plus-emph-style = "bold syntax #4e6356";
        line-numbers-minus-style = "bold #f38ba8";
        line-numbers-plus-style = "bold #a6e3a1";
        line-numbers-zero-style = "#6c7086";
        line-numbers-left-style = "#6c7086";
        line-numbers-right-style = "#6c7086";
        blame-palette = "#1e1e2e #181825 #11111b #313244 #45475a";
      };
    };
  };

  # --- direnv --------------------------------------------------------------
  programs.direnv = {
    enable = true;
    nix-direnv.enable = true;
  };

  # --- atuin ---------------------------------------------------------------
  programs.atuin = {
    enable = true;
    enableZshIntegration = true;
    settings = {
      search_mode = "fuzzy";
      filter_mode = "global";
      style = "compact";
      inline_height = 20;
      show_preview = true;
    };
  };

  # --- lazygit -------------------------------------------------------------
  programs.lazygit = {
    enable = true;
    settings = {
      gui = {
        nerdFontsVersion = "3";
        theme = {
          activeBorderColor = [
            "blue"
            "bold"
          ];
          inactiveBorderColor = [ "white" ];
          optionsTextColor = [ "blue" ];
          selectedLineBgColor = [ "default" ];
          cherryPickedCommitBgColor = [ "default" ];
          cherryPickedCommitFgColor = [ "blue" ];
          unstagedChangesColor = [ "red" ];
          defaultFgColor = [ "default" ];
          searchingActiveBorderColor = [ "yellow" ];
        };
        authorColors."*" = "blue";
      };
      git.pagers = [
        {
          pager = "delta --paging=never";
          colorArg = "always";
        }
      ];
    };
  };

  # --- yazi ----------------------------------------------------------------
  programs.yazi = {
    enable = true;
    enableZshIntegration = true;
  };

  # --- zellij --------------------------------------------------------------
  programs.zellij = {
    enable = true;
    settings = {
      theme = "catppuccin-mocha";
      default_layout = "compact";
      pane_frames = false;
    };
  };

  # --- btop ----------------------------------------------------------------
  programs.btop = {
    enable = true;
    settings = {
      force_tty = true;
      vim_keys = true;
      theme_background = false;
    };
  };

  # --- Git -----------------------------------------------------------------
  programs.git = {
    enable = true;
    settings = {
      init.defaultBranch = "main";
      pull.rebase = true;
      push.autoSetupRemote = true;
      rebase.autoStash = true;
      merge.conflictstyle = "zdiff3";
      diff.algorithm = "histogram";
      rerere.enabled = true;
      fetch.prune = true;
      alias = {
        st = "status -sb";
        amend = "commit --amend --no-edit";
        undo = "reset --soft HEAD~1";
      };
    };
  };

  # --- k9s config ----------------------------------------------------------
  home.sessionVariables.K9S_CONFIG_DIR = "$HOME/.config/k9s";

  home.file.".config/k9s/config.yaml".text = builtins.toJSON {
    k9s = {
      liveViewAutoRefresh = false;
      refreshRate = 2;
      ui = {
        enableMouse = false;
        headless = false;
        logoless = false;
        crumbsless = false;
        noIcons = false;
        skin = "catppuccin-mocha-transparent";
      };
    };
  };

  home.file.".config/k9s/skins/catppuccin-mocha-transparent.yaml".source =
    ./config/k9s/skins/catppuccin-mocha-transparent.yaml;
}
