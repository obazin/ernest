---
paths:
    - 'src/**'
---

# Frontend module ownership

## Owners

| Concern                                                                          | Owner                                                       |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Wiring: document lifecycle, shortcuts, persisting settings, routing them onwards | `src/App.svelte`                                            |
| Settings schema, defaults, limits, normalising stored values                     | `src/lib/settings.ts`                                       |
| How settings look: CSS custom properties, font stacks, overlay strengths         | `src/lib/appearance.ts`                                     |
| Palettes and applying them                                                       | `src/lib/themes/palettes.ts`                                |
| Document paths: names, resolving typed paths, path → kind                        | `src/lib/documents.ts`                                      |
| Languages with a dictionary (mirrors `Language` in `spelling.rs`)                | `src/lib/spellingLanguages.ts`                              |
| Calling Rust (`invoke`)                                                          | `src/lib/backend.ts` only                                   |
| Running asynchronous tasks one at a time (saves)                                 | `src/lib/serialQueue.ts`                                    |
| Build-time tuning values                                                         | `src/lib/config.ts`                                         |
| CodeMirror view, compartments, `EditorOptions`                                   | `src/lib/editor/writingEditor.ts`                           |
| Line breaks inserted into CRLF documents                                         | `src/lib/editor/lineBreaks.ts`                              |
| The Vim engine reading text with `\n` line breaks                                | `src/lib/editor/vim/lineFeedReads.ts`                       |
| Spell checking in the editor, including every spelling IPC call and the cache    | `src/lib/editor/spelling.ts`                                |
| One Vim behaviour each (motion, operator, setter)                                | `src/lib/editor/vim/<behaviour>.ts`                         |
| Interface components                                                             | `design-system/`, `features/` (see `docs/design-system.md`) |

## Dependency direction

```
App.svelte
  → features/  → design-system/
  → editor/    → editor/vim/
  → settings.ts → owners of each value (palettes, spellingLanguages, vim/escapeSequence)
  → appearance.ts, documents.ts, backend.ts, serialQueue.ts, spellingLanguages.ts, themes/
```

- `editor/` never imports `settings.ts` or the `Settings` type. It takes `EditorOptions` and plain values; `App.svelte` maps `Settings` onto them in `editorOptions()` and onto the Vim setters (`setClipboardSharing`, `applyEscapeSequence`, `applyMappings`).
- `design-system/` imports nothing outside itself. `features/<name>/` may import the design system and the shared modules above, never another feature.
- `settings.ts` may import the module that owns a value in order to validate it; those modules never import `settings.ts` back.
- Inside `editor/`, only `spelling.ts` imports `backend.ts`. Other editor modules call `spelling.ts` (`checkWords`, `suggestionsFor`, `addToDictionary`), so the per-word cache stays correct.
- Tauri APIs other than `invoke` stay in the module that owns the concern: window and dialogs in `App.svelte`, path functions in `documents.ts`, the clipboard in `editor/vim/clipboard.ts`.

## Smells to fix on sight

- CSS, font or opacity values computed in `settings.ts` or inline in `App.svelte`: they belong in `appearance.ts`.
- A helper function defined inside `App.svelte`'s `<script>` that does not touch component state: move it to the owning `.ts` module and test it.
- The same object literal built from `Settings` in two places: one function.
- A domain list (languages, palettes, file kinds) declared inside `settings.ts`: give it its own module and let settings import it.
- An editor module importing `backend` directly when a subsystem module already wraps those calls.
