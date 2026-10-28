# Architecture

Ernest is a [Tauri 2](https://v2.tauri.app) application. A small Rust process owns the window, the file system and the system font list; the interface is a Svelte 5 single-page app rendered in the operating system's webview (WKWebView on macOS, WebView2 on Windows, WebKitGTK on Linux), with [CodeMirror 6](https://codemirror.net) as the editor.

```
┌──────────────────────── webview ────────────────────────┐
│ App.svelte        document lifecycle, shortcuts, settings│
│  ├─ WritingEditor  CodeMirror view + compartments        │
│  │   ├─ vim()            @replit/codemirror-vim          │
│  │   ├─ typewriter       centred scrolling               │
│  │   ├─ markdown()       highlighting                    │
│  │   └─ editorTheme      colours/typography via CSS vars │
│  ├─ StatusLine.svelte                                    │
│  └─ SettingsPanel.svelte                                 │
│ backend.ts  ── invoke() ──┐                               │
└───────────────────────────┼───────────────────────────────┘
                            ▼
┌──────────────────────── Rust ───────────────────────────┐
│ documents.rs  read / atomic write / launch argument      │
│ fonts.rs      system font families (fontdb)              │
│ settings.rs   settings.json in the app config directory  │
│ lib.rs        builder, dialog plugin, quit interception  │
└──────────────────────────────────────────────────────────┘
```

## Responsibilities

The split follows one rule: the backend does what a webview cannot do safely or at all (touch arbitrary files, enumerate fonts, intercept application quit), and the frontend owns everything else, including every decision about the document's state.

### Backend commands

| Command                                       | Module         | Purpose                                                                                                                                                                   |
| --------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `read_document(path)`                         | `documents.rs` | Returns `{ path, text, exists }`. A missing file is not an error: it returns `exists: false` with empty text so `:e new.md` works like Vim. Non-UTF-8 content is refused. |
| `write_document(path, text)`                  | `documents.rs` | Atomic write; returns the absolute path written.                                                                                                                          |
| `initial_document_path()`                     | `documents.rs` | The first non-flag command-line argument, made absolute.                                                                                                                  |
| `list_system_fonts()`                         | `fonts.rs`     | Sorted, unique family names; async because parsing every font file takes a moment.                                                                                        |
| `load_settings()` / `save_settings(settings)` | `settings.rs`  | Opaque JSON in the app config directory.                                                                                                                                  |

Errors are a single `thiserror` enum serialised as its display string: the frontend only ever shows them, it never branches on them.

### Atomic writes

`write_atomically` resolves symlinks first (so the link survives), writes to a hidden sibling `.<name>.ernest-<pid>`, calls `sync_all`, copies the original permissions, then renames over the target. Rename within one directory is atomic on every supported file system, so a crash or full disk mid-save leaves the previous version intact. The temporary file is removed if any step fails.

### Settings ownership

The settings schema, defaults and validation live only in `src/lib/settings.ts`. The backend stores whatever JSON it is given. `normalizeSettings` turns any stored value (missing, malformed, from an older or newer version) into a valid `Settings` object, so adding a setting never touches Rust and a bad file never blocks startup.

## Editor

`WritingEditor` (`src/lib/editor/writingEditor.ts`) wraps the `EditorView`. Everything that can change at runtime (Vim, typewriter scrolling, language, focus mode and spell check attributes) sits in its own `Compartment`, so toggling one reconfigures only that part and keeps undo history. Loading a document replaces the whole `EditorState` instead, which deliberately starts a fresh history.

Extension order matters in one place: `vim()` comes first so it sees keys before any other keymap.

Line endings: CodeMirror normalises to `\n` internally. When a loaded file contains `\r\n`, the state is created with `EditorState.lineSeparator.of('\r\n')` and the text is read back with `state.sliceDoc()`, which joins with that separator, so CRLF files round-trip unchanged.

### Typewriter scrolling

`src/lib/editor/typewriter.ts` keeps the cursor line at the vertical centre. Scroll requests come from many sources: CodeMirror commands, search, and the Vim engine, which dispatches its own "make it visible" scroll after each motion. Adding a centred scroll effect to transactions is therefore not enough, because whichever request comes last wins.

Instead, an `EditorView.scrollHandler` intercepts every scroll-into-view request and replaces it with "centre this line". Two companions cover the cases that would not request a scroll at all:

- a transaction extender that adds a scroll request whenever the selection moves or the text changes (a click on an already visible line);
- a view plugin that re-centres after geometry changes (window resize, font change).

Scroll handlers run while the view is in its update phase, where `coordsAtPos` and the other measuring APIs throw. The handler therefore measures the cursor's visual (wrapped) line through `view.domAtPos` and a DOM `Range`, falling back to the height map (`lineBlockAt` plus `documentTop`) for positions outside the rendered viewport, such as after `G`.

The content has `calc(50vh - 1em)` of padding above and below so the first and last lines can reach the centre.

### Vim ex commands

The Vim engine keeps ex commands in one global registry. `installVimCommands` registers them once and routes them to whichever handlers the app installed last, so hot reloading and new editor states never double-register. `parseExArguments` splits the `!` from the argument string (the engine hands `:q!` over as command `q` with argument `!`).

Each command maps to a `DiscardPolicy`: `refuse` (Vim's `E37` message) without a bang, `force` with one. The same document functions use `ask` (a confirmation dialog) when called from shortcuts, menus or window close.

## Theming

A theme is a `Palette` of semantic roles (`background`, `surface`, `border`, `foreground`, `muted`, `accent`, `cursor`, `selection`, `heading`, `emphasis`, `strong`, `link`, `code`, `quote`, `highlight`) in `src/lib/themes/palettes.ts`.

`applyPalette` writes each role to a CSS custom property on the document root (`--color-background`, …) and sets `color-scheme`. The editor theme (`editorTheme.ts`) and every Svelte component read only those properties. Typography is passed the same way (`--editor-font-family`, `--editor-font-size`, `--editor-line-height`, `--editor-column-width`, `--editor-vertical-padding`).

Consequences:

- Switching theme or font is a style change on one element; the editor is never reconfigured.
- There is exactly one CodeMirror theme and one `HighlightStyle`, whose colours are `var(--color-…)` references.
- The interface and the text can never disagree about colours.

Markdown highlighting relies on the tags emitted by `@lezer/markdown`. Rules for tags applied to a whole subtree (`BulletList/...` → `list`, `Link/...` → `link`) are combined with the inner node's tags and the later CSS rule wins, so the style deliberately has no rule for `tags.list`; otherwise list items would override inline code and links inside them.

## Fonts

`fontdb` parses the name table of every installed font. The English family name is preferred (localised names are not always accepted by webview font matching), and private system faces whose names start with `.` are dropped. The webview resolves CSS `font-family` against the same system fonts, so any returned name can be used directly. The chosen family is quoted and followed by a monospace fallback stack (`fontFamilyStack`).

The settings panel renders each font name in its own face. `content-visibility: auto` keeps the hundreds of rows cheap by skipping layout of the ones not on screen.

## Window lifecycle

- The main window starts hidden (`"visible": false`) and is shown once settings and theme are applied, so it never flashes unstyled.
- On macOS, `tauri.macos.conf.json` uses an overlay title bar with a hidden title; a transparent 28 px strip with `data-tauri-drag-region` keeps the window draggable.
- Window close goes through `onCloseRequested`, which can cancel it when the user keeps unsaved changes.
- Application quit (Cmd+Q, the app menu) arrives in Rust as `RunEvent::ExitRequested` with no exit code. While a window is open, `lib.rs` prevents the exit and emits `quit-requested`; the frontend runs the unsaved-changes check and destroys its window, and the last window closing ends the process. An explicit `exit(code)` is never intercepted.

## Security

- **Content Security Policy** (`tauri.conf.json`): scripts and styles only from the app itself (inline styles are allowed for CodeMirror and Svelte), no frames, no objects, IPC as the only connection.
- **Capabilities** (`src-tauri/capabilities/default.json`): the main window gets core defaults, the specific window operations the interface uses (show, focus, drag, full screen, title, close, destroy) and the dialog operations it uses (open, save, ask, message). No file-system plugin is exposed to the webview; all file access goes through the typed commands above.
