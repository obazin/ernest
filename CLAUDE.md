# Ernest — distraction-free writing app

Tauri 2 (Rust) + Svelte 5 + CodeMirror 6, for Markdown and plain text, with a complete Vim mode. Read [`docs/architecture.md`](docs/architecture.md) for how the halves fit together and [`docs/development.md`](docs/development.md) for the dev shell, checks and the recipes for adding a theme, setting, ex command or backend command.

## Mandatory rules

> Break any of these and the task is not done.

1. **Svelte MCP after every `.svelte` edit.** Call `mcp__svelte__svelte-autofixer` on the changed file, fix every reported issue, and repeat until clean.
2. **Svelte 5 runes only.** Never use Svelte 4 syntax (`$:`, `export let`, `on:event`, `<slot>`, `createEventDispatcher`).
3. **Live docs over memory.** Before writing against Svelte 5, Tauri v2 (core or plugins), CodeMirror 6 or `@replit/codemirror-vim`, look the API up with `mcp__svelte__get-documentation` or context7 (`resolve-library-id` then `query-docs`).
4. **Run `rust-ipc-reviewer` after IPC-surface changes.** Any edit to a `#[tauri::command]`, to `generate_handler!` or managed state in `src-tauri/src/lib.rs`, or to `src-tauri/capabilities/*.json` is followed by the `rust-ipc-reviewer` subagent, and its findings are fixed or answered.
5. **Keep the docs current.** A user-facing change is described in `docs/user-guide.md` (settings table, ex command table, Vim keys) in the same commit. A change to how the halves fit together updates `docs/architecture.md`; a change to the workflow updates `docs/development.md`.
6. **Documentation describes the present, concisely.** Doc comments, module headers and `docs/*.md` answer what a thing is, why it exists and how it is used. No "used to be", "was renamed from" or refactor history: that belongs in commit messages.
7. **Every mechanism is cross-platform, or hides behind one facade.** Ernest ships on macOS, Windows and Linux (WebKitGTK is the weakest renderer). Choose something that works on all three, or put the per-OS implementations behind `#[cfg(target_os = …)]` in a single module that every caller goes through. Check the other platforms compile with `just check-targets`.
8. **AST / LSP over string-pattern search for code.** Use `ast-grep` (`ast-grep run --lang ts -p '<pattern>'`, also `rust`) for structural search and refactors, and the LSP tool (TypeScript and rust-analyzer) for definitions, references and renames. Quote `$`-patterns in single quotes. `ast-grep --lang ts` does not parse `.svelte` files: fall back to Grep or LSP there. Plain text, logs and config stay with Grep.
9. **Green before done.** `just check` passes (svelte-check, Prettier, Vitest, `cargo fmt --check`, Clippy with warnings denied, `cargo test`) before a task is reported complete.
10. **Never edit lock files by hand.** Change `pnpm-lock.yaml` with `pnpm`, `Cargo.lock` with `cargo`.

## Tools to use

| Tool                                           | When                                                          |
| ---------------------------------------------- | ------------------------------------------------------------- |
| `mcp__svelte__svelte-autofixer`                | After every `.svelte` edit (rule 1)                           |
| `mcp__svelte__get-documentation`               | Before writing Svelte 5 code                                  |
| context7 (`resolve-library-id` + `query-docs`) | Tauri v2, CodeMirror 6, `@replit/codemirror-vim`, Rust crates |
| `ast-grep`                                     | Structural code search and refactors (rule 8)                 |
| LSP tool                                       | Definition, references, rename, type at point (rule 8)        |
| `rust-ipc-reviewer` agent                      | After any IPC-surface change (rule 4)                         |
| `/implement-issue #<number>`                   | Taking a GitHub issue from branch to reviewed commits         |

## Quick reference

```sh
just run              # pnpm tauri dev with hot reload; `just run notes.md` opens a file
just check            # every check: types, formatting, tests, Clippy
just check-targets    # type-check the Rust code for macOS x86_64, Windows and Linux
just format           # Prettier and rustfmt
just release          # release bundle into src-tauri/target/release/bundle/
```

Run inside the dev shell (`direnv allow` once, or `nix develop`). Flakes only see files tracked by git: `git add` a new file before Nix needs it.

## Commits

Subjects are a plain imperative sentence describing the user-visible effect (`Fold Markdown sections with zc, zo, za, zM and zR`), with no conventional-commit prefix. The body explains the behaviour and the reasoning in prose.
