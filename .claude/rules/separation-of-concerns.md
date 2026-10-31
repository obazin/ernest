# Separation of concerns

Every concern in Ernest has exactly one owning module. Before adding code, find the owner and put it there; when no owner fits, create a module named after the concern rather than lodging it in the nearest file. The path-scoped rules in `frontend-modules.md` and `backend-modules.md` list the owners; `docs/architecture.md` explains them.

## Principles

- **A module is named for one concern and holds only that concern.** `settings.ts` is the schema, `documents.rs` is documents. A helper that two unrelated modules need is a sign it belongs to neither: move it to a module of its own (`files.rs` for atomic writes, `spellingLanguages.ts` for the language list) instead of having one domain import another's internals.
- **Dependencies point one way: from the page down to primitives.** A lower layer never imports a higher one. If a low module needs a value from a high one, pass it in (props, `EditorOptions`, a function argument) rather than importing it.
- **One rule, one place.** A validation or mapping lives with the module that applies it; others ask that module (`normalizeSettings` calls `isEscapeSequence` from the Vim module, it does not repeat the regex). Duplicating a rule, or a struct-to-struct mapping, in two places is a bug waiting to diverge.
- **Pure logic stays out of components.** Path handling, parsing, validation and value mappings go in a `.ts` module with a `*.test.ts` beside it, so they are testable without a webview. Components wire state to those functions.
- **I/O goes through one door per side.** The webview reaches Rust only through `src/lib/backend.ts`; inside a subsystem, one module owns the calls for that subsystem (`editor/spelling.ts` for spelling), and its neighbours go through it so caches and invariants hold.
- **The facade rule applies to concerns too.** Just as per-OS code hides behind one module (CLAUDE.md rule 7), a cross-cutting mechanism (atomic writes, clipboard, IPC) has one module every caller goes through.

## Before you finish

Ask of every file you touched:

1. Does everything in it belong to the concern its name states? Would someone looking for this code look here?
2. Does it import anything from a layer above it?
3. Is any rule or mapping now written in two places?
4. Is there pure logic inside a `.svelte` file that could be a tested function?
5. Did a file's responsibilities change? Then its module header, `docs/architecture.md` and the project layout in `docs/development.md` change in the same commit (CLAUDE.md rules 5 and 6).
