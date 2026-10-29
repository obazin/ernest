# Development

## Environment

The development shell comes from the shared [tauri-projects](https://github.com/obazin/tauri-projects) flake, which builds on [rust-projects](https://github.com/obazin/rust-projects) for the Rust pin; `flake.nix` here only names the project. It is loaded automatically by direnv (`.envrc` contains `use flake`; run `direnv allow` once), or manually with `nix develop`.

It provides:

| Tool                                                                   | Notes                                                                                                                                                                                                       |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rust                                                                   | rust-projects' pinned channel with clippy, rustfmt, rust-src and rust-analyzer, plus the standard library for every shipped target so `just check-targets` works from any host                              |
| cargo-nextest, cargo-audit, cargo-deny, cargo-outdated, cargo-edit     |                                                                                                                                                                                                             |
| sccache                                                                | Set as `RUSTC_WRAPPER`; the cache in `~/.cache/sccache` is shared with every other Rust project on the machine. `sccache --show-stats` shows the hit rate.                                                  |
| Node 22, pnpm                                                          |                                                                                                                                                                                                             |
| typescript-language-server, vtsls, svelteserver, nixd, marksman, taplo | For editors                                                                                                                                                                                                 |
| just, git, ripgrep, fd, jq, ast-grep                                   |                                                                                                                                                                                                             |
| `run`                                                                  | Wrapper for `just run`                                                                                                                                                                                      |
| `bootstrap-ai-harness`                                                 | Runs on shell entry: creates any missing file of the shared AI agent harness (`CLAUDE.md`, `.mcp.json`, `.claude/`). Files already present are never touched, so the project's versions are the ones in git |
| Linux only                                                             | GTK 3, WebKitGTK 4.1, libsoup 3, glib-networking and friends, with `GIO_MODULE_DIR`, `XDG_DATA_DIRS` and `WEBKIT_DISABLE_DMABUF_RENDERER=1` set                                                             |

`CARGO_HOME` is placed in `.cargo/` at the repository root. `rust-toolchain.toml` is a symlink the shell creates into the Nix store, so rustup reads the same pin; it is not committed. The shell re-executes into zsh when started interactively.

Flakes only see files tracked by git: `git add` a new file before Nix needs it.

To update the pins:

```sh
nix flake update            # tauri-projects, and through it rust-projects and nixpkgs
# Rust: bump the channel in rust-projects, then update here
pnpm update --latest        # frontend dependencies
cd src-tauri && cargo update
```

TypeScript is held at 6.x because `svelte-check` does not support 7 yet; `pnpm peers check` reports when that changes.

## Everyday commands

| Command                                      | Does                                                                                                                             |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `just run` / `run`                           | `pnpm tauri dev`: Vite on port 1420 with hot reload plus the Rust app                                                            |
| `just run notes.md`                          | Same, opening a file                                                                                                             |
| `just check`                                 | Everything CI should run: `svelte-check`, Prettier check, Vitest, `cargo fmt --check`, Clippy with warnings denied, `cargo test` |
| `just check-frontend` / `just check-backend` | One half of the above                                                                                                            |
| `just check-targets`                         | `cargo check` for macOS x86_64, Windows and Linux, to catch platform-specific compile errors                                     |
| `just format`                                | Prettier and rustfmt                                                                                                             |
| `just release`                               | `pnpm tauri build`; bundles land in `src-tauri/target/release/bundle/`                                                           |
| `just icons`                                 | Regenerate every platform icon from `app-icon.svg`                                                                               |

`just check-targets` type-checks the Rust code only. Build scripts that call another platform's native tools (the clipboard plugin's Objective-C, Tauri's Windows resource script, pkg-config lookups for the Linux webview and D-Bus libraries) get stand-ins that answer their probes and write empty outputs, since a type check never links; nothing extra needs installing. Building a Windows or Linux bundle still needs that platform (or CI), because the webview libraries are linked natively.

## Project layout

```
flake.nix                        dev shell (from tauri-projects)
Justfile                         task runner
ernest.config.json               build-time tuning values, validated by src/lib/config.ts
index.html, src/main.ts          entry point
src/App.svelte                   document lifecycle, shortcuts, settings wiring
src/app.css                      Tailwind entry: design tokens (@theme), base styles
src/lib/backend.ts               typed wrappers over the Rust commands
src/lib/settings.ts              settings schema, defaults, validation
src/lib/wordCount.ts             word counting
src/lib/components/              StatusLine, SettingsPanel
src/lib/editor/                  WritingEditor, typewriter, spelling, Vim commands, editor theme
src/lib/editor/vim/              Vim motions, actions and operators tuned for prose
src/lib/themes/palettes.ts       theme palettes and applyPalette
src-tauri/src/                   lib.rs, documents.rs, fonts.rs, settings.rs, spelling.rs, error.rs
src-tauri/dictionaries/          Hunspell dictionaries (en-US, fr, it, es), bundled as resources, with their licences
src-tauri/tauri.conf.json        app, window, bundle and CSP configuration
src-tauri/tauri.macos.conf.json  macOS window overrides (overlay title bar)
src-tauri/capabilities/          webview permissions
docs/                            this documentation
```

See [architecture.md](architecture.md) for how the pieces interact.

## Tests

- **Frontend:** Vitest, files named `*.test.ts` next to the code they test (`pnpm test`). Pure logic (settings validation, word count, ex argument parsing) is tested directly.
- **Backend:** `cargo test` in `src-tauri/`. The document tests use `tempfile` and cover round-trips with CRLF and non-ASCII text, replacing content without leaving temporary files, writing through a symlink, missing files and binary files.
- **Manual:** editor behaviour (typewriter centring, Vim modes, theme switching) is checked by running the app. When it matters, check it on every platform: Linux's WebKitGTK is the most likely to differ.

## Conventions

- Identifiers use full words, never abbreviations (`error`, not `err`; `arguments`, not `args`), except where an external API imposes a name.
- Formatting: Prettier (4-space indent, single quotes, 100 columns) and rustfmt; run `just format`.
- Markdown is not hard-wrapped: one paragraph per line.
- Comments explain why, not what.
- Components are styled with Tailwind utilities built from the tokens in `src/app.css`: semantic colours (`bg-surface`, `text-muted`, `border-border`, `text-accent`), the interface type scale (`text-label`, `text-caption`, `text-body`, `text-title`), `tracking-*`, `rounded-control`/`rounded-card` and Tailwind's 4px spacing grid. No `<style>` blocks, no raw colours, no arbitrary values in brackets (`text-[13px]`): when nothing fits, add a token with a semantic name to `@theme`. There is no `dark:` variant; a theme is a palette applied at runtime. Inline `style:` is for values that are data, such as a theme card previewing its own palette.

## Recipes

### Add a theme

1. Add a `Palette` to the `palettes` array in `src/lib/themes/palettes.ts`. Fill every role; the comments on `PaletteColors` describe what each one colours. Prefer the theme's official colours and map them by meaning (headings, emphasis, links, code) rather than by position.
2. Its `identifier` is the name used by `:colo`, so keep it lowercase and hyphenated.
3. Add it to the table in [user-guide.md](user-guide.md#themes).

Nothing else changes: the settings panel and `:colo` read the array. A new palette role also needs a `--color-<role>` token in `src/app.css`'s `@theme`.

### Add a setting

1. Add the field to `Settings`, `defaultSettings` and `normalizeSettings` in `src/lib/settings.ts` (plus `limits` for a number), and a case in `settings.test.ts`.
2. Apply it in `App.svelte`: a CSS custom property in the typography `$effect` (declared in `src/app.css`), or a new `EditorOptions` field passed to `editor.configure`.
3. For an editor toggle, give it a compartment in `WritingEditor` and handle it in `configure`.
4. Expose it in `SettingsPanel.svelte` (the `toggles` list handles booleans).
5. Document it in the user guide's settings table.

The backend needs no change.

### Add a Vim ex command

1. Add a handler to `VimCommandHandlers` in `src/lib/editor/vimCommands.ts` and register it in `installVimCommands` with `Vim.defineEx(name, shortestPrefix, …)`. Use `parseExArguments` for the bang and argument.
2. Implement the handler where `installVimCommands` is called in `App.svelte`.
3. Document it in the user guide's ex command table.

### Add a backend command

1. Write an `async fn` with `#[tauri::command]` returning `crate::error::Result<T>` in the module that owns the concern (or a new one), and register it in `generate_handler!` in `lib.rs`.
2. Add a typed wrapper to `src/lib/backend.ts`.
3. If it needs a Tauri plugin or core permission, grant only the specific permission in `capabilities/default.json`.

### Release

1. Bump the version in `package.json`, `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`.
2. `just check`, then `just release` on each target platform.
3. macOS bundles must be signed and notarised for distribution outside the developer's machine; this is not set up yet.
