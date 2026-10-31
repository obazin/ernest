# Architecture

Ernest is a [Tauri 2](https://v2.tauri.app) application. A small Rust process owns the window, the file system and the system font list; the interface is a Svelte 5 single-page app styled with [Tailwind CSS 4](https://tailwindcss.com), rendered in the operating system's webview (WKWebView on macOS, WebView2 on Windows, WebKitGTK on Linux), with [CodeMirror 6](https://codemirror.net) as the editor.

```
┌──────────────────────── webview ────────────────────────┐
│ App.svelte        document lifecycle, shortcuts, settings│
│  ├─ WritingEditor  CodeMirror view + compartments        │
│  │   ├─ vim()            @replit/codemirror-vim          │
│  │   ├─ typewriter       anchored scrolling              │
│  │   ├─ markdown()       highlighting                    │
│  │   ├─ livePreview      hides markup off the cursor line│
│  │   ├─ spelling         underlines unknown words        │
│  │   └─ editorTheme      colours/typography via CSS vars │
│  ├─ StatusLine     features/status                       │
│  └─ SettingsPanel  features/settings, on design-system/  │
│ backend.ts  ── invoke() ──┐                               │
└───────────────────────────┼───────────────────────────────┘
                            ▼
┌──────────────────────── Rust ───────────────────────────┐
│ access.rs     which paths the webview may touch          │
│ documents.rs  read / write / dialogs / launch argument   │
│ blocking.rs   slow work on the blocking thread pool      │
│ files.rs      atomic write, content stamps               │
│ fonts.rs      system font families (fontdb)              │
│ locale.rs     the system's preferred languages           │
│ menu.rs       app menu; Quit asks the frontend first     │
│ settings.rs   settings.json in the app config directory  │
│ spelling.rs   Hunspell dictionaries, own words           │
│ lib.rs        builder, plugins, commands, state          │
└──────────────────────────────────────────────────────────┘
```

## Responsibilities

The split follows one rule: the backend does what a webview cannot do safely or at all (touch arbitrary files, enumerate fonts, route the macOS Quit menu item), and the frontend owns everything else, including every decision about the document's state.

### Backend commands

| Command                                                          | Module         | Purpose                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `read_document(path)`                                            | `documents.rs` | Returns `{ path, text, exists, stamp }`. A missing file is not an error: it returns `exists: false` with empty text so `:e new.md` works like Vim. Non-UTF-8 content is refused, and so is a file over 16 MB, without reading past the limit. `stamp` marks the contents read, or their absence. |
| `write_document(path, text, expected)`                           | `documents.rs` | Atomic write, refusing text over 16 MB. With `expected`, a file whose stamp no longer matches is left alone and `{ outcome: 'changedOnDisk' }` comes back; otherwise `{ outcome: 'written', path, stamp }`. The frontend asks before writing again without `expected`.                           |
| `initial_document_path()`                                        | `documents.rs` | The first non-flag command-line argument, made absolute and granted.                                                                                                                                                                                                                             |
| `choose_document_to_open()` / `choose_document_to_save(current)` | `documents.rs` | The native open and save dialogs; the chosen path is granted.                                                                                                                                                                                                                                    |
| `list_system_fonts()`                                            | `fonts.rs`     | Sorted, unique family names; parsing every font file takes a moment.                                                                                                                                                                                                                             |
| `load_settings()` / `save_settings(settings)`                    | `settings.rs`  | Opaque JSON in the app config directory.                                                                                                                                                                                                                                                         |
| `system_languages()`                                             | `locale.rs`    | The system's preferred languages as BCP 47 tags (`sys-locale`); the first one with a dictionary becomes the spelling language when none is stored. WKWebView's `navigator.languages` reports the app's localisation instead, so the webview cannot answer this.                                  |
| `check_words(words, languages)`                                  | `spelling.rs`  | Whether each word is spelled correctly in at least one of the languages.                                                                                                                                                                                                                         |
| `spelling_suggestions(word, languages)`                          | `spelling.rs`  | Up to nine corrections, merged across the languages.                                                                                                                                                                                                                                             |
| `add_to_dictionary(word)`                                        | `spelling.rs`  | Adds a word to the personal word list.                                                                                                                                                                                                                                                           |

Errors are a single `thiserror` enum serialised as its display string: the frontend only ever shows them, it never branches on them. An outcome the frontend acts on, such as a file changed on disk, is part of the command's result instead.

Every command that touches the disk, parses fonts, queries the OS or waits on a native dialog runs that work through `on_blocking_pool` (`blocking.rs`), Tauri's blocking thread pool. The async runtime has only a few workers, so slow work run on them directly would delay every other command; a panic in the pool comes back as an error instead of a reply that never arrives.

### Document access

`read_document` and `write_document` refuse a folder outright, before any grant or confirmation, read or write a granted path or a text document by name without asking, and show the writer a native confirmation for anything else (`access.rs`). A path is granted when the writer chose it outside the webview: on the command line, in the open and save dialogs (which therefore run in the backend rather than through the webview's dialog plugin), or by allowing it in that confirmation. A text document by name is a local path in any folder ending in `.md`, `.markdown`, `.mdown`, `.mkd`, `.txt` or `.text` that resolves through symlinks to such a file. Everything else raises a `Concern` and asks: another kind of file, a text name linking to one, a Windows device name, a path that exists but cannot be resolved, and a Windows UNC, WebDAV or device path, which is asked about before any file-system call since resolving it would contact the network. The confirmation is a native dialog shown by the backend, so the webview can neither answer nor skip it; declining fails the command, allowing grants the path. `check` returns the resolved file and the commands read or write exactly that path. Grants match on the path as given and as resolved, and last until the app quits, so autosave never asks twice. The save dialog is seeded only from a path the webview may already write without asking. Reading and writing refuse a folder again where the I/O happens, for network paths, which are only inspected once allowed, and for files replaced by a folder since the check. A compromised webview can thus reach text documents and the files the writer picked or allowed, but never `~/.ssh`, a shell profile or a network share without the writer seeing it.

### Atomic writes

Everything the backend persists (documents, settings, the personal dictionary) goes through `write_atomically` in `files.rs`. It resolves symlinks first (so the link survives), writes to a hidden sibling `.<name>.ernest-<pid>-<count>` created exclusively (a fresh name per write, never an existing file or a planted symlink, so concurrent saves of one file cannot share it), calls `sync_all`, copies the original permissions, then renames over the target. A target the writer may not write (probed by opening it for writing, which covers the read-only attribute, Unix ownership and modes, ACLs and macOS locks) is refused before the temporary file is created: Windows cannot rename over a read-only file and would leave a read-only temporary behind, and on Unix the rename would replace a file the writer does not own. Rename within one directory is atomic on every supported file system, so a crash or full disk mid-save leaves the previous version intact. The temporary file is removed if any step fails. `write_atomically_if` asks a precondition about the target just before the rename; documents use it to check, at the last moment, that the file still holds what was read (its content stamp, a hash of the bytes compared within one run), so another application's save is lost only if it lands between that last check and the rename.

### Settings ownership

The settings schema, defaults and validation live only in `src/lib/settings.ts`. The backend stores whatever JSON it is given. Validation asks the module that owns each value (`palettes` for a theme, `spellingLanguages.ts` for languages, `isEscapeSequence` in the Vim module for an escape sequence), so a rule is written once. `normalizeSettings` turns any stored value (missing, malformed, from an older or newer version) into a valid `Settings` object, so adding a setting never touches Rust and a bad file never blocks startup.

## Frontend modules

Each module owns one concern, and dependencies point from the page down:

| Module                        | Owns                                                                                            |
| ----------------------------- | ----------------------------------------------------------------------------------------------- |
| `App.svelte`                  | Wiring: document lifecycle, shortcuts, persisting settings, routing settings to their consumers |
| `settings.ts`                 | The settings schema, defaults, limits and normalisation of stored values                        |
| `appearance.ts`               | How settings look: typography custom properties, font stacks, overlay strengths                 |
| `themes/palettes.ts`          | Palettes and `applyPalette`                                                                     |
| `documents.ts`                | Document paths: names, resolving typed paths, path → `DocumentKind`                             |
| `spellingLanguages.ts`        | The languages with a dictionary, mirroring the backend's `Language` enum                        |
| `backend.ts`                  | Typed wrappers over the Rust commands; the only `invoke` caller                                 |
| `serialQueue.ts`              | Running asynchronous tasks one at a time, so saves never overlap                                |
| `editor/`                     | CodeMirror and Vim behaviour, configured through `EditorOptions`; never reads `Settings`        |
| `design-system/`, `features/` | Interface components (see [design-system.md](design-system.md))                                 |

The editor knows nothing of the settings object: `App.svelte` maps `Settings` to `EditorOptions` and to the Vim setters (`setClipboardSharing`, `applyEscapeSequence`, `applyMappings`). Within `editor/`, `spelling.ts` is the only module that calls the backend; the Vim spelling keys go through it so the answer cache stays consistent.

## Editor

`WritingEditor` (`src/lib/editor/writingEditor.ts`) wraps the `EditorView`. Everything that can change at runtime (Vim, typewriter scrolling, language with live preview, focus mode, spell checking) sits in its own `Compartment`, so toggling one reconfigures only that part and keeps undo history. Loading a document replaces the whole `EditorState` instead, which deliberately starts a fresh history.

Focus mode is drawn outside CodeMirror. While it is on, the `focusPoint` plugin (`src/lib/editor/focusPoint.ts`) reports the screen y it centres on, the typewriter anchor or the cursor's line, through the `onFocusPointMove` callback whenever the cursor, text, layout or scroll position changes. `App.svelte` places a `SpotlightOverlay` there, above the editor and below the status line and settings panel.

Extension order matters in one place: `vim()` comes first so it sees keys before any other keymap.

Line endings: CodeMirror normalises to `\n` internally. When a loaded file contains `\r\n`, the state is created with `EditorState.lineSeparator.of('\r\n')` and the text is read back with `state.sliceDoc()`, which joins with that separator, so CRLF files round-trip unchanged. Such a state recognises only `\r\n` in inserted text, so `lineBreakInsertions` (`editor/lineBreaks.ts`) turns every `\n` or `\r` in an insertion into a real line break, whether it comes from the Vim engine, an extension or the clipboard. The Vim engine reads text through its adapter with `\n` line breaks in every document (`editor/vim/lineFeedReads.ts`), so `:sort`, visual `r` and yanks never see a `\r`, and registers keep `\n` line breaks.

### Live preview

`src/lib/editor/livePreview.ts` is a view plugin that walks the Markdown syntax tree over the visible ranges and adds decorations: `Decoration.replace` hides marker nodes (`HeaderMark`, `EmphasisMark`, `CodeMark`, `LinkMark` with the URL, `QuoteMark`, …) or swaps them for small widgets (bullets, task boxes, rules), and a line decoration draws the quote bar. The document text is never touched, so saving, undo and Vim registers see exactly what is in the file.

Markup is revealed per line, for every line a selection range touches, rather than per element as Obsidian does. Within the line being edited, column positions therefore never shift as the cursor moves, which Vim motions such as `f*`, `3l` or `t)` depend on. The decorations are rebuilt when the document, viewport, selection, focus or parse tree changes. Replacements never span a line break, since plugins may only do that with block widgets. The plugin lives in the language compartment, so it is present only for Markdown documents and toggling it keeps undo history.

### Typewriter scrolling

`src/lib/editor/typewriter.ts` keeps the cursor line at the anchor, a height of the window set in the settings (40–80 % from the top, held in a facet). Scroll requests come from many sources: CodeMirror commands, search, and the Vim engine, which dispatches its own "make it visible" scroll after each motion. Adding an anchored scroll effect to transactions is therefore not enough, because whichever request comes last wins.

Instead, an `EditorView.scrollHandler` intercepts every scroll-into-view request and replaces it with "hold this line at the anchor". The target scroll position never goes below zero, so near the start of the document the text stays where it is until it reaches the anchor. Two companions cover the cases that would not request a scroll at all:

- a transaction extender that adds a scroll request whenever the selection moves or the text changes (a click on an already visible line);
- a view plugin that re-anchors after geometry changes (window resize, font change).

Scroll handlers run while the view is in its update phase, where `coordsAtPos` and the other measuring APIs throw. The handler therefore measures the cursor's visual (wrapped) line through `view.domAtPos` and a DOM `Range`, falling back to the height map (`lineBlockAt` plus `documentTop`) for positions outside the rendered viewport, such as after `G`.

The content has the window height below the anchor as bottom padding (`--editor-padding-bottom`, set by `App.svelte`) so the last line can reach the anchor; the top padding stays the ordinary margin.

### Spell checking

The webview's native spell checker only draws underlines; it cannot be asked where the misspellings are or what to replace them with, which Vim's spelling keys need. Ernest therefore checks spelling itself and turns the native checker off.

The backend (`spelling.rs`) owns the dictionaries: one Hunspell dictionary per `Language` (English (US) from SCOWL, French from Grammalecte, Italian and Spanish from the LibreOffice projects, all as normalised to UTF-8 by wooorm/dictionaries), read with the pure-Rust `spellbook` crate. They ship in `src-tauri/dictionaries/` as bundle resources rather than inside the binary, so every platform spells alike and each keeps its own licence beside it (`<code>.LICENSE.txt`; Italian is GPL-3.0, French MPL-2.0, Spanish GPL/LGPL/MPL). A language's dictionary is parsed the first time a command asks for it and kept in Tauri-managed state. The language codes are a closed serde enum, so the frontend can never name a file. A word is correct when any requested language accepts it; suggestions take the first of each language, then the second, and so on, without repeats. Words the writer adds go to `dictionary.txt` in the app config directory, one per line, written atomically before any dictionary learns them, and are taught to every dictionary as it loads. Parsing and suggesting take tens of milliseconds per language, so the commands run on the blocking pool rather than an async worker; words over 100 characters (Hunspell's limit) are neither judged nor learnt, and one `check_words` call takes at most 10,000 words.

The frontend (`src/lib/editor/spelling.ts`) finds the words and is the editor's only route to the spelling commands; the language list lives in `src/lib/spellingLanguages.ts`. It skips Markdown code, URLs, HTML and link definitions using the syntax tree, plus bare URLs, e-mail addresses and paths, which the tree does not mark. A view plugin collects the words in the rendered viewport and, 300 ms after typing or scrolling pauses, sends the ones it has not seen in one `check_words` call along with the chosen languages. Answers are cached per word, shared by every editor, so the backend only ever sees new words. Changing the languages clears the cache and re-checks the visible words (`spellingRecheck`); answers that arrive for languages no longer chosen are dropped. The word ending at the cursor is not underlined while it is being typed.

### Vim ex commands

The Vim engine keeps ex commands in one global registry. `installVimCommands` registers them once and routes them to whichever handlers the app installed last, so hot reloading and new editor states never double-register. `parseExArguments` splits the `!` from the argument string (the engine hands `:q!` over as command `q` with argument `!`).

Each command maps to a `DiscardPolicy`: `refuse` (Vim's `E37` message) without a bang, `force` with one. The same document functions use `ask` (a confirmation dialog) when called from shortcuts, menus or window close.

## Theming

A theme is a `Palette` of semantic roles (`background`, `surface`, `border`, `foreground`, `muted`, `accent`, `cursor`, `selection`, `heading`, `emphasis`, `strong`, `link`, `code`, `quote`, `highlight`) in `src/lib/themes/palettes.ts`.

`applyPalette` writes each role to a CSS custom property on the document root (`--color-background`, …) and sets `color-scheme`. The same properties are the colour tokens of Tailwind's `@theme` in `src/app.css`, declared with Catppuccin Mocha's values, so the Svelte components style themselves with semantic utilities (`bg-surface`, `text-muted`, `border-border`) that resolve through `var(--color-…)` and follow the palette. The editor theme (`editorTheme.ts`) reads the same properties directly. Typography is passed the same way, by `applyTypography` in `appearance.ts`: `--font-editor` is a theme token too (`font-editor`), and `--editor-font-size`, `--editor-line-height`, `--editor-column-width` and `--editor-vertical-padding` are plain custom properties only the editor theme reads.

Consequences:

- Switching theme or font is a style change on one element; the editor is never reconfigured.
- There is exactly one CodeMirror theme and one `HighlightStyle`, whose colours are `var(--color-…)` references.
- The interface and the text can never disagree about colours.
- Tailwind's stock palette is cleared (`--color-*: initial`), so no component can use a colour that ignores the theme. The theme is declared `static`, which keeps every token in the stylesheet even when only TypeScript (the editor theme) refers to it.

Markdown highlighting relies on the tags emitted by `@lezer/markdown`. Rules for tags applied to a whole subtree (`BulletList/...` → `list`, `Link/...` → `link`) are combined with the inner node's tags and the later CSS rule wins, so the style deliberately has no rule for `tags.list`; otherwise list items would override inline code and links inside them.

## Fonts

`fontdb` parses the name table of every installed font. The English family name is preferred (localised names are not always accepted by webview font matching), and private system faces whose names start with `.` are dropped. The webview resolves CSS `font-family` against the same system fonts, so any returned name can be used directly. The chosen family is quoted and followed by a monospace fallback stack (`fontFamilyStack` in `appearance.ts`).

The settings panel renders each font name in its own face. `content-visibility: auto` keeps the hundreds of rows cheap by skipping layout of the ones not on screen.

## Window lifecycle

- The main window starts hidden (`"visible": false`) and is shown once settings and theme are applied, so it never flashes unstyled.
- On macOS, `tauri.macos.conf.json` uses an overlay title bar with a hidden title; a transparent 28 px strip with `data-tauri-drag-region` keeps the window draggable.
- Window close goes through `onCloseRequested`, which can cancel it when the user keeps unsaved changes.
- Quitting goes through the frontend. Closing the window raises a close request the frontend intercepts; the Quit menu item (Cmd+Q on macOS) is Ernest's own, built in `menu.rs`, and emits `quit-requested`. Either way the frontend runs the unsaved-changes check and destroys the window, and the last window closing ends the process. The stock macOS Quit item would send `terminate:` straight to `NSApp`, which ends the process without any event Rust could prevent; Quit from the Dock and logging out still do, and skip the check.

## Security

- **Content Security Policy** (`tauri.conf.json`): scripts and styles only from the app itself (inline styles are allowed for CodeMirror and Svelte), no frames, no objects, IPC as the only connection.
- **Capabilities** (`src-tauri/capabilities/default.json`): the main window gets core defaults, the specific window operations the interface uses (show, focus, drag, full screen, title, close, destroy) and the dialog operations it uses (ask, message). The file dialogs and all file access go through the typed commands above, gated by document access; no file-system plugin is exposed to the webview.
