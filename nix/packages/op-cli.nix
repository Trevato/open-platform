{
  lib,
  stdenvNoCC,
  bun,
  cacert,
}:

let
  src = ../../tools/op-cli;

  deps = stdenvNoCC.mkDerivation {
    name = "op-cli-deps";
    inherit src;

    nativeBuildInputs = [
      bun
      cacert
    ];

    dontFixup = true;
    impureEnvVars = lib.fetchers.proxyImpureEnvVars;
    outputHashMode = "recursive";
    outputHashAlgo = "sha256";
    outputHash = "sha256-/hgjMtHr05eCBeKFJQu5pzJ05ZnbyIotQr96TisuGbM=";

    buildPhase = ''
      export HOME=$TMPDIR
      bun install --frozen-lockfile
    '';

    installPhase = ''
      cp -r node_modules $out
    '';
  };
in
stdenvNoCC.mkDerivation {
  pname = "op-cli";
  version = "1.0.0";
  inherit src;

  nativeBuildInputs = [ bun ];
  dontFixup = true;

  buildPhase = ''
    export HOME=$TMPDIR
    cp -r ${deps} node_modules
    chmod -R u+w node_modules
    bun build --compile src/index.ts --outfile op
  '';

  installPhase = ''
    mkdir -p $out/bin
    cp op $out/bin/
  '';

  meta = {
    description = "Open Platform CLI";
    mainProgram = "op";
  };
}
