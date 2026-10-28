# Ernest

A distraction-free writing app for Markdown and plain text, with a complete Vim mode. Runs on macOS, Windows and Linux.

- **Zen view by default:** one fixed-width column, typewriter scrolling that keeps the current line at the vertical centre, and a status line that fades away while you type.
- **Vim:** full modal editing, plus the ex commands writers need (`:w`, `:e`, `:q`, `:sav`, `:colo` …).
- **Themes for the whole window:** Catppuccin, Darcula, Dracula, Nord, Gruvbox, Solarized, Tokyo Night, One Dark, Rosé Pine.
- **Any installed font**, previewed in its own face.

Built with Tauri 2 (Rust), Svelte 5 and CodeMirror 6.

## Quick start

```sh
direnv allow       # or: nix develop
pnpm install
just run           # dev build with hot reload; `just run notes.md` opens a file
```

## Documentation

- [User guide](docs/user-guide.md): the zen view, files, Vim commands, shortcuts, settings, known limitations
- [Architecture](docs/architecture.md): how the frontend and backend fit together, and why
- [Development](docs/development.md): dev shell, checks, releases, and how to add a theme, setting or command
