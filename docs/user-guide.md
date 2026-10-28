# User guide

## The zen view

Ernest opens straight into a single column of text on an empty page. There are no toolbars, sidebars or menus to dismiss.

- **Fixed-width column.** The text column keeps the same width in pixels whatever the window size (680 px by default), so line length stays comfortable to read. Change it under Settings → Column width.
- **Typewriter scrolling.** The line you are writing stays at the vertical centre of the window, and the text moves around it. This holds when typing, when moving with Vim motions, after jumps such as `G` or a search, and after resizing the window. Toggle it with Mod+Shift+T.
- **Focus mode.** Dims every paragraph except the one holding the cursor. Toggle it with Mod+Shift+D.
- **Live preview.** In Markdown documents, the syntax (`#`, `**`, `_`, backticks, `[…](…)`, `>`) is hidden and only its effect shows: a heading reads as a heading, a link as its text. The markup reappears on the line holding the cursor (every line of a selection), so you edit the raw text and see the result as soon as you move away. Bullets show as `•`, task boxes as `☐`/`☑`, horizontal rules as a line, and quotes keep a bar in the margin. Fenced code blocks and images are left as written. When the window loses focus, every line is shown rendered. Toggle it with Mod+Shift+P.
- **Status line.** Shows the file name, a dot when there are unsaved changes, the Vim mode and the word count. It fades out as soon as you type and comes back when you pause or move the mouse. Messages such as `"notes.md" written` also appear there.
- **Full screen.** Ctrl+Cmd+F on macOS, F11 elsewhere.

On macOS the title bar is hidden; drag the window by its top edge.

## Files

Ernest edits one document at a time.

| Format                      | Extensions                                   | Treatment                                                                                                         |
| --------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Markdown (GitHub flavoured) | `.md`, `.markdown`, `.mdown`, `.mkd`, `.mdx` | Headings, emphasis, links, quotes and code are coloured; fenced code blocks are highlighted in their own language |
| Plain text                  | anything else                                | No highlighting                                                                                                   |

A new, unnamed document is treated as Markdown. Saving it under another extension switches the highlighting.

Files are read and written as UTF-8. A file that is not valid UTF-8 is refused rather than corrupted. Windows (CRLF) line endings are preserved as they are.

Saving is safe against crashes: the new text is written to a temporary file next to the original, flushed to disk, then renamed over it, so an interrupted save leaves the previous version intact. Saving through a symbolic link updates the target and keeps the link, and the file's permissions are kept.

Opening a path that does not exist yet (from the command line or with `:e`) gives an empty document under that name; the file is created on the first save. This matches `vim new.md`.

### Opening a file on launch

```sh
Ernest path/to/chapter.md
```

In development: `just run path/to/chapter.md`.

### Unsaved changes

Closing the window, quitting, opening another file or starting a new one with unsaved changes asks for confirmation first. The Vim commands answer the Vim way instead: `:q`, `:e` and `:enew` refuse with `E37: No write since last change (add ! to override)`, and the `!` forms discard.

### Autosave

With Settings → Autosave on, a document that has a file name is saved 1.5 seconds after you stop typing. Untitled documents are never autosaved.

## Vim mode

Vim mode is on by default; turn it off under Settings → Vim mode. Normal, insert, visual (character, line, block) and replace modes, operators, text objects, counts, registers, marks, macros, `.` repeat, `/` and `?` search, and `:s` substitution are provided by [codemirror-vim](https://github.com/replit/codemirror-vim). Yanked text is highlighted briefly so you can see what was copied.

### Keys tuned for prose

A paragraph is one long line that wraps on screen, so the keys below work on the lines you see rather than on whole paragraphs.

| Keys                    | Effect                                                                                                                                                                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `j`, `k`                | Move down or up one line on screen. With an operator (`dj`, `yk`) they still act on whole paragraphs.                                                                                                                                         |
| `gj`, `gk`              | Move down or up one whole paragraph line.                                                                                                                                                                                                     |
| `0`, `^`, `$`           | Go to the start, first non-blank character, or end of the line on screen.                                                                                                                                                                     |
| `A`, `I`                | Insert at the end or start of the line on screen.                                                                                                                                                                                             |
| `H`, `L`                | Go to the first or last line visible in the window. A count counts lines inward, e.g. `3H`.                                                                                                                                                   |
| `Ctrl+D`, `Ctrl+U`      | Move half a window down or up. A count moves that many lines instead, e.g. `5 Ctrl+D`.                                                                                                                                                        |
| `]]`, `[[`              | Go to the next or previous Markdown heading (the end or start of the document past the last one). Works with operators: `d]]` deletes to the next heading.                                                                                    |
| `o`, `O`                | Open a line below or above. In a list or quote the new line continues it: `- `, `- [ ] `, the next number, `> `.                                                                                                                              |
| `gq`, `gw`              | Join lines into one line per paragraph (instead of wrapping at 80 columns), e.g. `gqip` for the paragraph, `gqG` to the end. List items, quotes, headings, tables, code blocks and hard line breaks are kept. `gw` keeps the cursor in place. |
| `J`, `K` in visual mode | Move the selected lines down or up, keeping them selected. In normal mode `J` still joins lines.                                                                                                                                              |

### Ex commands

| Command           | Effect                                                                                                      |
| ----------------- | ----------------------------------------------------------------------------------------------------------- |
| `:w`              | Save. An untitled document asks for a location.                                                             |
| `:w path`         | Write a copy to `path`; the current document keeps its name. An untitled document takes `path` as its name. |
| `:sav path`       | Save under `path` and continue editing that file.                                                           |
| `:wq`, `:x`       | Save and close.                                                                                             |
| `:q`              | Close, refusing if there are unsaved changes.                                                               |
| `:q!`             | Close and discard unsaved changes.                                                                          |
| `:e path`         | Open `path`, refusing if there are unsaved changes.                                                         |
| `:e`              | Re-read the current file from disk (opens the file picker for an untitled document).                        |
| `:e!`             | Revert to the version on disk, discarding changes.                                                          |
| `:enew`, `:enew!` | Start a new untitled document.                                                                              |
| `:colo`           | Show the current theme.                                                                                     |
| `:colo name`      | Switch theme, e.g. `:colo tokyo-night`. Theme names are listed below.                                       |

Paths may be absolute, start with `~/`, or be relative to the folder of the current document (relative to your home folder for an untitled one).

## Keyboard shortcuts

`Mod` is Cmd on macOS and Ctrl on Windows and Linux.

| Keys                    | Action                                         |
| ----------------------- | ---------------------------------------------- |
| Mod+S                   | Save                                           |
| Mod+Shift+S             | Save as                                        |
| Mod+O                   | Open                                           |
| Mod+N                   | New document                                   |
| Mod+,                   | Settings (Esc closes)                          |
| Mod+= / Mod+- / Mod+0   | Font size up / down / reset                    |
| Mod+Shift+T             | Toggle typewriter scrolling                    |
| Mod+Shift+D             | Toggle focus mode                              |
| Mod+Shift+P             | Toggle live preview                            |
| Mod+F                   | Search (outside Vim mode; in Vim mode use `/`) |
| Ctrl+Cmd+F (macOS), F11 | Full screen                                    |

On Windows and Linux, Ctrl+O and Ctrl+N mean something in Vim (jump back, completion). While Vim mode is on, those two shortcuts are left to Vim; use `:e` and `:enew` instead.

## Settings

Open with Mod+,. Changes apply immediately and are saved automatically.

| Setting              | Default           | Range                      |
| -------------------- | ----------------- | -------------------------- |
| Theme                | Catppuccin Mocha  | see below                  |
| Font                 | Default monospace | any installed font         |
| Size                 | 18 px             | 10–40 px                   |
| Line height          | 1.70              | 1.00–2.50                  |
| Column width         | 680 px            | 360–1400 px                |
| Vim mode             | on                |                            |
| Typewriter scrolling | on                |                            |
| Focus mode           | off               |                            |
| Live preview         | on                | Markdown documents only    |
| Spell checking       | on                | uses the system dictionary |
| Autosave             | off               |                            |

Settings are stored as JSON in:

| Platform | Location                                                             |
| -------- | -------------------------------------------------------------------- |
| macOS    | `~/Library/Application Support/it.olivierbazin.ernest/settings.json` |
| Linux    | `~/.config/it.olivierbazin.ernest/settings.json`                     |
| Windows  | `%APPDATA%\it.olivierbazin.ernest\settings.json`                     |

The file can be edited by hand while the app is closed. Unknown keys are ignored, and invalid or out-of-range values fall back to their defaults, so a broken file never prevents startup.

## Themes

Each theme colours the whole window: the page, the text and Markdown syntax, the cursor and selection, the status line and the settings panel.

| Name for `:colo`       | Theme                | Appearance |
| ---------------------- | -------------------- | ---------- |
| `catppuccin-mocha`     | Catppuccin Mocha     | dark       |
| `catppuccin-macchiato` | Catppuccin Macchiato | dark       |
| `catppuccin-frappe`    | Catppuccin Frappé    | dark       |
| `catppuccin-latte`     | Catppuccin Latte     | light      |
| `darcula`              | Darcula              | dark       |
| `dracula`              | Dracula              | dark       |
| `nord`                 | Nord                 | dark       |
| `gruvbox-dark`         | Gruvbox Dark         | dark       |
| `gruvbox-light`        | Gruvbox Light        | light      |
| `solarized-dark`       | Solarized Dark       | dark       |
| `solarized-light`      | Solarized Light      | light      |
| `tokyo-night`          | Tokyo Night          | dark       |
| `one-dark`             | One Dark             | dark       |
| `rose-pine`            | Rosé Pine            | dark       |

## Known limitations

- Only tested on macOS so far. Windows and Linux builds are configured but have not yet been run; Linux renders through WebKitGTK, whose text rendering and performance are the weakest of the three webviews.
- Quitting from the application menu (Cmd+Q) is routed through the unsaved-changes check, but that path has not been verified on every platform.
- Undoing back to the saved text still shows the document as modified.
- No final newline is added on save (Vim's `fixeol` behaviour).
- One document per window, and one window.
- Opening files from the Finder / Explorer ("Open with") is declared in the bundle but not yet handled at runtime; use the command line or Mod+O.
