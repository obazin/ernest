{
  description = "ernest — distraction-free writing app (Tauri + Svelte + CodeMirror 6)";

  # Self-contained rather than built on chess-flake: ernest lives outside the
  # chess workspace, so it owns its own pins. The shell keeps the same shape as
  # chess-flake's `tauriShell` (toolchain from rust-toolchain.toml, sccache,
  # Node + pnpm + LSPs, zsh re-exec) so moving between projects feels the same.
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    rust-overlay = {
      url = "github:oxalica/rust-overlay";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      rust-overlay,
      flake-utils,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs {
          inherit system;
          overlays = [ (import rust-overlay) ];
        };
        inherit (pkgs) lib stdenv;

        # ── Rust ────────────────────────────────────────────────────────────
        # Channel and components come from rust-toolchain.toml (the single
        # owner of the pin); the cross targets are added here so the per-OS
        # `#[cfg]` branches can be type-checked from any host with
        # `cargo check --target <triple>`.
        toolchainFile = (fromTOML (builtins.readFile ./rust-toolchain.toml)).toolchain;
        rustToolchain = pkgs.rust-bin.stable.${toolchainFile.channel}.minimal.override {
          extensions = toolchainFile.components;
          targets = [
            "aarch64-apple-darwin"
            "x86_64-apple-darwin"
            "x86_64-pc-windows-msvc"
            "aarch64-pc-windows-msvc"
            "x86_64-unknown-linux-gnu"
            "aarch64-unknown-linux-gnu"
          ];
        };

        rustTools = [
          rustToolchain
          pkgs.rust-analyzer
          pkgs.cargo-nextest
          # Content-addressed rustc cache shared across every Rust project on
          # the host (~/.cache/sccache). `sccache --show-stats` for hit rate.
          pkgs.sccache
        ];

        # ── Node ────────────────────────────────────────────────────────────
        nodeTools = with pkgs; [
          nodejs_22
          pnpm
          typescript-language-server
          svelte-language-server
          vtsls
        ];

        # ── Tauri system dependencies ───────────────────────────────────────
        # macOS builds against the system WKWebView: pkg-config is enough.
        # Linux renders through WebKitGTK 4.1 and needs the GTK stack, libsoup
        # for the webview's networking and glib-networking for TLS. This is
        # the platform where rendering quality is weakest, so keep it
        # buildable from day one rather than discovering gaps at release.
        tauriTools =
          [ pkgs.pkg-config ]
          ++ lib.optionals stdenv.hostPlatform.isLinux (
            with pkgs;
            [
              gtk3
              webkitgtk_4_1
              libsoup_3
              glib
              glib-networking
              cairo
              pango
              gdk-pixbuf
              atk
              harfbuzz
              librsvg
              openssl
              # fontdb enumerates fonts by walking the fontconfig directories.
              fontconfig
            ]
          );

        commonTools = with pkgs; [
          git
          just
          ripgrep
          fd
          jq
          zsh
        ];

        # ── Shell shorthands ────────────────────────────────────────────────
        # `run` launches the app in dev. A wrapper on PATH rather than a
        # shellHook alias: direnv exports variables, not aliases, and the hook
        # runs in bash before exec'ing zsh. Not named `r`, which is a zsh
        # builtin and would shadow it.
        shorthands = [
          (pkgs.writeShellScriptBin "run" ''
            exec just run "$@"
          '')
        ];

        linuxEnv = lib.optionalAttrs stdenv.hostPlatform.isLinux {
          # TLS for the webview, and the GSettings schemas GTK file dialogs need.
          GIO_MODULE_DIR = "${pkgs.glib-networking}/lib/gio/modules/";
          XDG_DATA_DIRS = lib.concatStringsSep ":" [
            "${pkgs.gsettings-desktop-schemas}/share/gsettings-schemas/${pkgs.gsettings-desktop-schemas.name}"
            "${pkgs.gtk3}/share/gsettings-schemas/${pkgs.gtk3.name}"
          ];
          # WebKitGTK's DMA-BUF renderer shows blank windows on several GPU /
          # driver combinations (notably NVIDIA). Off by default in dev.
          WEBKIT_DISABLE_DMABUF_RENDERER = "1";
        };
      in
      {
        devShells.default = pkgs.mkShell (
          {
            name = "ernest";
            packages = commonTools ++ rustTools ++ nodeTools ++ tauriTools ++ shorthands;

            RUST_SRC_PATH = "${rustToolchain}/lib/rustlib/src/rust/library";
            RUSTC_WRAPPER = "sccache";

            shellHook = ''
              export CARGO_HOME="''${CARGO_HOME:-$(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD")/.cargo}"
              echo "ernest · $(date +%H:%M:%S)"
              export SHELL=${pkgs.zsh}/bin/zsh
              if [[ $- == *i* && -z "''${IN_ERNEST_ZSH:-}" ]]; then
                export IN_ERNEST_ZSH=1
                exec ${pkgs.zsh}/bin/zsh
              fi
            '';
          }
          // linuxEnv
        );

        formatter = pkgs.nixfmt-rfc-style;
      }
    );
}
