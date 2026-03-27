{
  description = "Open Platform — self-hosted developer platform on k3s";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
        op-cli = pkgs.callPackage ./nix/packages/op-cli.nix { };
      in
      {
        packages = {
          inherit op-cli;
          default = op-cli;
          deploy = pkgs.callPackage ./nix/packages/deploy.nix { };
        };

        devShells.default = import ./nix/shells/default.nix {
          inherit pkgs op-cli;
        };
      }
    )
    // {
      nixosModules.open-platform = import ./nix/modules/open-platform.nix;
      nixosModules.default = self.nixosModules.open-platform;
    };
}
