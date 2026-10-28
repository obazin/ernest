import { defaultPaletteIdentifier, palettes } from './themes/palettes';

export interface Settings {
    theme: string;
    /** A system font family name; empty means the default monospace stack. */
    fontFamily: string;
    fontSize: number;
    lineHeight: number;
    /** Width of the text column, in CSS pixels. */
    columnWidth: number;
    vim: boolean;
    typewriter: boolean;
    focusMode: boolean;
    spellcheck: boolean;
    /** Hides Markdown syntax except on the lines being edited. */
    livePreview: boolean;
    /** Writes a named document shortly after typing stops. */
    autosave: boolean;
    /** In Vim mode, the unnamed register is the system clipboard. */
    vimClipboard: boolean;
    /** Typed quickly in Vim insert mode, leaves it like Escape (e.g. `jk`); empty for none. */
    vimEscapeSequence: string;
    /** vimrc-style mapping lines (`nnoremap Y y$`), applied in Vim mode. */
    vimMappings: string;
}

/** The settings that are on/off toggles. */
export type BooleanSetting = {
    [Key in keyof Settings]: Settings[Key] extends boolean ? Key : never;
}[keyof Settings];

export const defaultSettings: Settings = {
    theme: defaultPaletteIdentifier,
    fontFamily: '',
    fontSize: 18,
    lineHeight: 1.7,
    columnWidth: 680,
    vim: true,
    typewriter: true,
    focusMode: false,
    spellcheck: true,
    livePreview: true,
    autosave: false,
    vimClipboard: true,
    vimEscapeSequence: '',
    vimMappings: '',
};

export const limits = {
    fontSize: { minimum: 10, maximum: 40, step: 1 },
    lineHeight: { minimum: 1, maximum: 2.5, step: 0.05 },
    columnWidth: { minimum: 360, maximum: 1400, step: 20 },
} as const;

/**
 * Builds valid settings from whatever was stored: unknown keys are dropped,
 * missing or malformed values fall back to their default, and numbers are
 * clamped to their range. A settings file from an older or newer version
 * therefore never breaks startup.
 */
export function normalizeSettings(stored: unknown): Settings {
    const source = (typeof stored === 'object' && stored !== null ? stored : {}) as Record<
        string,
        unknown
    >;

    const number = (key: keyof typeof limits): number => {
        const value = source[key];
        if (typeof value !== 'number' || !Number.isFinite(value)) return defaultSettings[key];
        return clamp(value, limits[key].minimum, limits[key].maximum);
    };
    const boolean = (
        key:
            | 'vim'
            | 'typewriter'
            | 'focusMode'
            | 'spellcheck'
            | 'livePreview'
            | 'autosave'
            | 'vimClipboard',
    ) => (typeof source[key] === 'boolean' ? source[key] : defaultSettings[key]);

    const theme =
        typeof source.theme === 'string' &&
        palettes.some((palette) => palette.identifier === source.theme)
            ? source.theme
            : defaultSettings.theme;

    return {
        theme,
        fontFamily: typeof source.fontFamily === 'string' ? source.fontFamily : '',
        fontSize: number('fontSize'),
        lineHeight: number('lineHeight'),
        columnWidth: number('columnWidth'),
        vim: boolean('vim'),
        typewriter: boolean('typewriter'),
        focusMode: boolean('focusMode'),
        spellcheck: boolean('spellcheck'),
        livePreview: boolean('livePreview'),
        autosave: boolean('autosave'),
        vimClipboard: boolean('vimClipboard'),
        vimEscapeSequence:
            typeof source.vimEscapeSequence === 'string' &&
            isEscapeSequence(source.vimEscapeSequence)
                ? source.vimEscapeSequence
                : '',
        vimMappings: typeof source.vimMappings === 'string' ? source.vimMappings : '',
    };
}

/**
 * An insert-mode escape sequence is two or three keys, none of them a space
 * or `<` (which would start a key name such as `<CR>`).
 */
export function isEscapeSequence(keys: string): boolean {
    return /^[^\s<]{2,3}$/u.test(keys);
}

export function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, value));
}

const fallbackFontStack = 'ui-monospace, "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace';

/** The CSS `font-family` value for a chosen family, with a fallback stack behind it. */
export function fontFamilyStack(family: string): string {
    if (family.trim() === '') return fallbackFontStack;
    const quoted = `"${family.replace(/["\\]/g, '\\$&')}"`;
    return `${quoted}, ${fallbackFontStack}`;
}
