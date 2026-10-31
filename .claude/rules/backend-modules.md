---
paths:
    - 'src-tauri/src/**'
---

# Backend module ownership

The backend does only what the webview cannot: touch arbitrary files, enumerate fonts, ask the OS, intercept quit. Every decision about document state, settings schema or interface stays in the frontend.

## Owners

| Concern                                                                           | Owner          |
| --------------------------------------------------------------------------------- | -------------- |
| Builder, plugins, managed state, `generate_handler!`, quit interception           | `lib.rs`       |
| Reading and writing documents, the launch argument                                | `documents.rs` |
| File-system primitives shared by several modules (`write_atomically`, `absolute`) | `files.rs`     |
| System font families                                                              | `fonts.rs`     |
| OS locale preferences                                                             | `locale.rs`    |
| `settings.json` as opaque JSON: load and save only                                | `settings.rs`  |
| Dictionaries, the personal word list, spelling commands                           | `spelling.rs`  |
| The single serialisable error type                                                | `error.rs`     |

## Rules

- **Domain modules do not import each other.** If `settings.rs` or `spelling.rs` needs something from `documents.rs`, that thing is not a document concern: move it to `files.rs` or a new module named for it. Domain modules may depend on `files.rs` and `error.rs`.
- **A command lives in the module of its concern**, not the module of its first caller. `system_languages` feeds the settings defaults but is an OS query, so it lives in `locale.rs`.
- **`settings.rs` stays schema-free.** It never names a setting; the schema, defaults and validation are in `src/lib/settings.ts`.
- **`lib.rs` only assembles.** No command bodies or business logic there; it registers commands and state, and handles run events.
- **New module, new header.** Start every module with a `//!` line saying what it owns, and list it in the module diagram in `docs/architecture.md` and the layout in `docs/development.md`.
- Moving a command between modules changes `generate_handler!`, so run the `rust-ipc-reviewer` agent afterwards (CLAUDE.md rule 4). The command name `invoke` sees is the function name, so `backend.ts` does not change.
