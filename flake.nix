{
  description = "ernest — distraction-free writing app (Tauri + Svelte + CodeMirror 6)";

  # The dev shell lives in tauri-projects: the Rust pin (from rust-projects),
  # the cross targets `just check-targets` uses, Node, the webview stack and
  # the AI agent harness, copied in on shell entry wherever a file is missing.
  # Do not add a rust-toolchain.toml: the shell materializes the shared one.
  inputs.tauri-projects.url = "github:obazin/tauri-projects";

  outputs =
    { tauri-projects, ... }:
    tauri-projects.forEachSystem (
      lib:
      lib.mkTauriProject {
        name = "ernest";
      }
    );
}
