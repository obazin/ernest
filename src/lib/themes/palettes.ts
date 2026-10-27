/**
 * Every theme is a palette of semantic roles rather than a CodeMirror theme.
 * The palette is written to CSS custom properties on the document root, and
 * both the editor (see `editorTheme.ts`) and the surrounding interface read
 * those properties, so switching theme recolours the whole window at once
 * without reconfiguring the editor.
 */
export interface Palette {
    identifier: string;
    name: string;
    appearance: 'dark' | 'light';
    colors: PaletteColors;
}

export interface PaletteColors {
    /** Page behind the text. */
    background: string;
    /** Panels and overlays drawn above the page. */
    surface: string;
    /** Hairlines, inactive controls, hover fills. */
    border: string;
    /** Body text. */
    foreground: string;
    /** Secondary text: status line, Markdown syntax marks, comments. */
    muted: string;
    /** Interactive elements and the active control. */
    accent: string;
    cursor: string;
    selection: string;
    heading: string;
    emphasis: string;
    strong: string;
    link: string;
    code: string;
    quote: string;
    /** Search matches and other transient highlights. */
    highlight: string;
}

const catppuccin = (
    identifier: string,
    name: string,
    appearance: Palette['appearance'],
    flavor: Record<
        | 'base'
        | 'mantle'
        | 'surface0'
        | 'surface1'
        | 'text'
        | 'overlay1'
        | 'rosewater'
        | 'mauve'
        | 'blue'
        | 'lavender'
        | 'peach'
        | 'green'
        | 'pink'
        | 'teal'
        | 'yellow',
        string
    >,
): Palette => ({
    identifier,
    name,
    appearance,
    colors: {
        background: flavor.base,
        surface: flavor.mantle,
        border: flavor.surface0,
        foreground: flavor.text,
        muted: flavor.overlay1,
        accent: flavor.mauve,
        cursor: flavor.rosewater,
        selection: flavor.surface1,
        heading: flavor.lavender,
        emphasis: flavor.pink,
        strong: flavor.peach,
        link: flavor.blue,
        code: flavor.green,
        quote: flavor.teal,
        highlight: flavor.yellow,
    },
});

export const palettes: Palette[] = [
    catppuccin('catppuccin-mocha', 'Catppuccin Mocha', 'dark', {
        base: '#1e1e2e',
        mantle: '#181825',
        surface0: '#313244',
        surface1: '#45475a',
        text: '#cdd6f4',
        overlay1: '#7f849c',
        rosewater: '#f5e0dc',
        mauve: '#cba6f7',
        blue: '#89b4fa',
        lavender: '#b4befe',
        peach: '#fab387',
        green: '#a6e3a1',
        pink: '#f5c2e7',
        teal: '#94e2d5',
        yellow: '#f9e2af',
    }),
    catppuccin('catppuccin-macchiato', 'Catppuccin Macchiato', 'dark', {
        base: '#24273a',
        mantle: '#1e2030',
        surface0: '#363a4f',
        surface1: '#494d64',
        text: '#cad3f5',
        overlay1: '#8087a2',
        rosewater: '#f4dbd6',
        mauve: '#c6a0f6',
        blue: '#8aadf4',
        lavender: '#b7bdf8',
        peach: '#f5a97f',
        green: '#a6da95',
        pink: '#f5bde6',
        teal: '#8bd5ca',
        yellow: '#eed49f',
    }),
    catppuccin('catppuccin-frappe', 'Catppuccin Frappé', 'dark', {
        base: '#303446',
        mantle: '#292c3c',
        surface0: '#414559',
        surface1: '#51576d',
        text: '#c6d0f5',
        overlay1: '#838ba7',
        rosewater: '#f2d5cf',
        mauve: '#ca9ee6',
        blue: '#8caaee',
        lavender: '#babbf1',
        peach: '#ef9f76',
        green: '#a6d189',
        pink: '#f4b8e4',
        teal: '#81c8be',
        yellow: '#e5c890',
    }),
    catppuccin('catppuccin-latte', 'Catppuccin Latte', 'light', {
        base: '#eff1f5',
        mantle: '#e6e9ef',
        surface0: '#ccd0da',
        surface1: '#bcc0cc',
        text: '#4c4f69',
        overlay1: '#8c8fa1',
        rosewater: '#dc8a78',
        mauve: '#8839ef',
        blue: '#1e66f5',
        lavender: '#7287fd',
        peach: '#fe640b',
        green: '#40a02b',
        pink: '#ea76cb',
        teal: '#179299',
        yellow: '#df8e1d',
    }),
    {
        identifier: 'darcula',
        name: 'Darcula',
        appearance: 'dark',
        colors: {
            background: '#2b2b2b',
            surface: '#313335',
            border: '#3c3f41',
            foreground: '#a9b7c6',
            muted: '#808080',
            accent: '#cc7832',
            cursor: '#bbbbbb',
            selection: '#214283',
            heading: '#ffc66d',
            emphasis: '#9876aa',
            strong: '#cc7832',
            link: '#6897bb',
            code: '#6a8759',
            quote: '#629755',
            highlight: '#32593d',
        },
    },
    {
        identifier: 'dracula',
        name: 'Dracula',
        appearance: 'dark',
        colors: {
            background: '#282a36',
            surface: '#21222c',
            border: '#44475a',
            foreground: '#f8f8f2',
            muted: '#6272a4',
            accent: '#bd93f9',
            cursor: '#f8f8f2',
            selection: '#44475a',
            heading: '#bd93f9',
            emphasis: '#f1fa8c',
            strong: '#ffb86c',
            link: '#8be9fd',
            code: '#50fa7b',
            quote: '#f1fa8c',
            highlight: '#ff79c6',
        },
    },
    {
        identifier: 'nord',
        name: 'Nord',
        appearance: 'dark',
        colors: {
            background: '#2e3440',
            surface: '#3b4252',
            border: '#434c5e',
            foreground: '#d8dee9',
            muted: '#616e88',
            accent: '#88c0d0',
            cursor: '#d8dee9',
            selection: '#434c5e',
            heading: '#88c0d0',
            emphasis: '#b48ead',
            strong: '#d08770',
            link: '#81a1c1',
            code: '#a3be8c',
            quote: '#8fbcbb',
            highlight: '#ebcb8b',
        },
    },
    {
        identifier: 'gruvbox-dark',
        name: 'Gruvbox Dark',
        appearance: 'dark',
        colors: {
            background: '#282828',
            surface: '#1d2021',
            border: '#3c3836',
            foreground: '#ebdbb2',
            muted: '#928374',
            accent: '#fe8019',
            cursor: '#ebdbb2',
            selection: '#504945',
            heading: '#fabd2f',
            emphasis: '#d3869b',
            strong: '#fe8019',
            link: '#83a598',
            code: '#b8bb26',
            quote: '#8ec07c',
            highlight: '#fabd2f',
        },
    },
    {
        identifier: 'gruvbox-light',
        name: 'Gruvbox Light',
        appearance: 'light',
        colors: {
            background: '#fbf1c7',
            surface: '#f2e5bc',
            border: '#ebdbb2',
            foreground: '#3c3836',
            muted: '#928374',
            accent: '#af3a03',
            cursor: '#3c3836',
            selection: '#d5c4a1',
            heading: '#b57614',
            emphasis: '#8f3f71',
            strong: '#af3a03',
            link: '#076678',
            code: '#79740e',
            quote: '#427b58',
            highlight: '#b57614',
        },
    },
    {
        identifier: 'solarized-dark',
        name: 'Solarized Dark',
        appearance: 'dark',
        colors: {
            background: '#002b36',
            surface: '#073642',
            border: '#0a4352',
            foreground: '#93a1a1',
            muted: '#586e75',
            accent: '#268bd2',
            cursor: '#93a1a1',
            selection: '#0a4a5a',
            heading: '#b58900',
            emphasis: '#d33682',
            strong: '#cb4b16',
            link: '#268bd2',
            code: '#859900',
            quote: '#2aa198',
            highlight: '#b58900',
        },
    },
    {
        identifier: 'solarized-light',
        name: 'Solarized Light',
        appearance: 'light',
        colors: {
            background: '#fdf6e3',
            surface: '#eee8d5',
            border: '#e4ddc8',
            foreground: '#586e75',
            muted: '#93a1a1',
            accent: '#268bd2',
            cursor: '#586e75',
            selection: '#e4ddc8',
            heading: '#b58900',
            emphasis: '#d33682',
            strong: '#cb4b16',
            link: '#268bd2',
            code: '#859900',
            quote: '#2aa198',
            highlight: '#b58900',
        },
    },
    {
        identifier: 'tokyo-night',
        name: 'Tokyo Night',
        appearance: 'dark',
        colors: {
            background: '#1a1b26',
            surface: '#16161e',
            border: '#292e42',
            foreground: '#c0caf5',
            muted: '#565f89',
            accent: '#7aa2f7',
            cursor: '#c0caf5',
            selection: '#33467c',
            heading: '#7aa2f7',
            emphasis: '#bb9af7',
            strong: '#ff9e64',
            link: '#7dcfff',
            code: '#9ece6a',
            quote: '#73daca',
            highlight: '#e0af68',
        },
    },
    {
        identifier: 'one-dark',
        name: 'One Dark',
        appearance: 'dark',
        colors: {
            background: '#282c34',
            surface: '#21252b',
            border: '#3e4451',
            foreground: '#abb2bf',
            muted: '#5c6370',
            accent: '#61afef',
            cursor: '#528bff',
            selection: '#3e4451',
            heading: '#e06c75',
            emphasis: '#c678dd',
            strong: '#d19a66',
            link: '#61afef',
            code: '#98c379',
            quote: '#56b6c2',
            highlight: '#e5c07b',
        },
    },
    {
        identifier: 'rose-pine',
        name: 'Rosé Pine',
        appearance: 'dark',
        colors: {
            background: '#191724',
            surface: '#1f1d2e',
            border: '#26233a',
            foreground: '#e0def4',
            muted: '#6e6a86',
            accent: '#c4a7e7',
            cursor: '#e0def4',
            selection: '#403d52',
            heading: '#ebbcba',
            emphasis: '#c4a7e7',
            strong: '#f6c177',
            link: '#9ccfd8',
            code: '#31748f',
            quote: '#9ccfd8',
            highlight: '#f6c177',
        },
    },
];

export const defaultPaletteIdentifier = 'catppuccin-mocha';

export function findPalette(identifier: string): Palette {
    return (
        palettes.find((palette) => palette.identifier === identifier) ??
        palettes.find((palette) => palette.identifier === defaultPaletteIdentifier)!
    );
}

/** Kebab-cases a role name into its custom property: `background` → `--color-background`. */
export function customPropertyName(role: keyof PaletteColors): string {
    return `--color-${role.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
}

export function applyPalette(palette: Palette, root: HTMLElement = document.documentElement) {
    for (const [role, value] of Object.entries(palette.colors)) {
        root.style.setProperty(customPropertyName(role as keyof PaletteColors), value);
    }
    root.style.colorScheme = palette.appearance;
    root.dataset.appearance = palette.appearance;
}
