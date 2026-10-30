# Design system

Ernest's interface is built with [Atomic Design](https://atomicdesign.bradfrost.com/chapter-2/): small primitives compose into larger units, and each component sits in one tier and one layer. This page is the methodology as Ernest applies it and the catalogue of every component; check it before writing new markup.

## Tiers

| Tier         | What it is                                                        | State it owns                                     | Test                                  |
| ------------ | ----------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------- |
| **Atom**     | An irreducible element: a button, an input, a heading             | None; its look comes from props                   | Could ship in any app                 |
| **Molecule** | A few atoms doing one job together: a labelled slider             | Trivial local state at most (a search query)      | Does exactly one thing                |
| **Organism** | A distinct section of the interface: the settings panel           | Section state; may call the backend for its data  | Makes sense on its own                |
| **Page**     | `App.svelte`: the organisms wired to the editor, settings and IPC | The document lifecycle and the persisted settings | Real content does not break the parts |

Ernest has a single screen, so there is no separate template tier: `App.svelte` places the editor, the status line and the settings panel, and the side panel's layout lives in the `SidePanel` organism.

State flows down as props and comes back up through callbacks (`onclick`, `onclose`) or `$bindable` values; the lower a component sits, the less it knows. Atoms and molecules never touch the backend, the settings module or the editor. Atoms stay small: add a prop the day a second caller needs it, and prefer a few named components over one with many flags.

## Layers

```
src/lib/
  design-system/            generic primitives, nothing Ernest-specific
    atoms/  molecules/  organisms/
  features/                 Ernest's own interface, built from the design system
    settings/  molecules/  organisms/
    status/    organisms/
src/App.svelte              the page
```

Dependencies point one way: `design-system/` imports nothing outside itself; `features/<name>/` imports the design system and Ernest's modules (`settings.ts`, `themes/`, `backend.ts`) but not another feature; `App.svelte` composes features. A component belongs in `design-system/` only if it would make sense in another app (a key-cap button, a slider field); anything that knows about palettes, fonts, spelling languages or Vim belongs to a feature.

Every component is styled with the semantic tokens of `src/app.css` (CLAUDE.md rule 11), so tiers say nothing about colour: a primitive follows the active palette like everything else.

## Adding interface

1. **Search.** Look through the catalogue below, design system first, then the feature you are working in.
2. **Exact match:** use it. Re-implementing an existing component's markup inline is a bug.
3. **Close match that needs a new prop or variant:** stop and ask before widening it, since every other caller inherits the change. The answer may be a variant, or a new component.
4. **No match:** create it in the right tier and layer, and add it to the catalogue in the same commit. A pattern written inline three times is a missing component.

## Catalogue

### Design system

| Component        | Tier     | Props                                                                         | Composed of    |
| ---------------- | -------- | ----------------------------------------------------------------------------- | -------------- |
| `ColorDot`       | Atom     | `color` (a colour shown as data)                                              |                |
| `KeyCapButton`   | Atom     | `key` (shown as a key cap), `label` (for assistive tech), `onclick`           |                |
| `SectionHeading` | Atom     | `children`                                                                    |                |
| `TextArea`       | Atom     | bindable `value`, any `<textarea>` attribute, `class`                         |                |
| `TextInput`      | Atom     | bindable `value`, any `<input>` attribute, `class`                            |                |
| `ToggleChip`     | Atom     | `pressed`, `locked`, `title`, `onclick`, `children`                           |                |
| `CheckboxField`  | Molecule | `label`, `hint`, bindable `checked`                                           |                |
| `SliderField`    | Molecule | `label`, `minimum`, `maximum`, `step`, bindable `value`, `format`, `disabled` |                |
| `SidePanel`      | Organism | `title`, `onclose`, `children`                                                | `KeyCapButton` |

`TextInput` and `TextArea` take text in the writer's own font (`font-editor`), for values that are typed as they would be in the editor: key sequences, Vim mappings. `SidePanel` is a modal dialog sliding in from the right edge: it takes focus when it opens and closes on Escape, on its `esc` key cap or on a click outside.

### Features

| Component                | Feature  | Tier     | Props                                                     | Composed of                                                                                                                                 |
| ------------------------ | -------- | -------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `FontPicker`             | settings | Molecule | `fonts`, `loading`, bindable `value`                      |                                                                                                                                             |
| `SpellingLanguagePicker` | settings | Molecule | bindable `value` (never empty)                            | `ToggleChip`                                                                                                                                |
| `ThemeCard`              | settings | Molecule | `palette`, `selected`, `onclick`                          | `ColorDot`                                                                                                                                  |
| `SettingsPanel`          | settings | Organism | bindable `settings`, `onclose`                            | `SidePanel`, `SectionHeading`, `SliderField`, `CheckboxField`, `TextInput`, `TextArea`, `ThemeCard`, `FontPicker`, `SpellingLanguagePicker` |
| `StatusLine`             | status   | Organism | `title`, `dirty`, `words`, `vimMode`, `message`, `hidden` |                                                                                                                                             |

`FontPicker` previews each family in itself and filters them as you type. `ThemeCard` previews a palette in that palette's own colours, which are data rather than tokens. `SettingsPanel` fetches the installed fonts when it opens.
