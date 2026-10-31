import { defaultPaletteIdentifier, palettes } from './themes/palettes';

export interface Settings {
    theme: string;
    /**
     * Strength of the anti-glare overlay over the whole window, in percent;
     * 0 is off. See `antiGlareOpacity` for how it maps to the overlay.
     * Focus mode replaces it while on.
     */
    antiGlare: number;
    /** A system font family name; empty means the default monospace stack. */
    fontFamily: string;
    fontSize: number;
    lineHeight: number;
    /** Width of the text column, in CSS pixels. */
    columnWidth: number;
    vim: boolean;
    typewriter: boolean;
    /**
     * Height of the window, in percent from the top, where typewriter
     * scrolling holds the cursor line once the text reaches it.
     */
    typewriterAnchor: number;
    /** How long typewriter scrolling takes to glide to a line the cursor moved to, in milliseconds. */
    typewriterGlide: number;
    focusMode: boolean;
    spellcheck: boolean;
    /** A word is spelled correctly when any of these knows it; never empty. */
    spellingLanguages: SpellingLanguage[];
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

/** The languages the spell checker has a dictionary for, by the code the backend expects. */
export const spellingLanguages = [
    { code: 'en-US', name: 'English (US)' },
    { code: 'fr', name: 'Français' },
    { code: 'it', name: 'Italiano' },
    { code: 'es', name: 'Español' },
] as const;

export type SpellingLanguage = (typeof spellingLanguages)[number]['code'];

/** The settings that are on/off toggles. */
export type BooleanSetting = {
    [Key in keyof Settings]: Settings[Key] extends boolean ? Key : never;
}[keyof Settings];

export const defaultSettings: Settings = {
    theme: defaultPaletteIdentifier,
    antiGlare: 0,
    fontFamily: '',
    fontSize: 18,
    lineHeight: 1.7,
    columnWidth: 680,
    vim: true,
    typewriter: true,
    typewriterAnchor: 50,
    typewriterGlide: 120,
    focusMode: false,
    spellcheck: true,
    spellingLanguages: ['en-US'],
    livePreview: true,
    autosave: false,
    vimClipboard: true,
    vimEscapeSequence: '',
    vimMappings: '',
};

export const limits = {
    antiGlare: { minimum: 0, maximum: 100, step: 5 },
    fontSize: { minimum: 10, maximum: 40, step: 1 },
    lineHeight: { minimum: 1, maximum: 2.5, step: 0.05 },
    columnWidth: { minimum: 360, maximum: 1400, step: 20 },
    typewriterAnchor: { minimum: 40, maximum: 80, step: 1 },
    typewriterGlide: { minimum: 50, maximum: 500, step: 10 },
} as const;

/**
 * Overlay opacity for an anti-glare strength: the full slider spans 0–0.7,
 * since past that the window flattens to an unreadable grey.
 */
export function antiGlareOpacity(strength: number): number {
    return (strength / 100) * 0.7;
}

/** Opacity of the focus mode fade where it is thickest. */
export const focusOverlayOpacity = 0.4;

/**
 * Builds valid settings from whatever was stored: unknown keys are dropped,
 * missing or malformed values fall back to their default, and numbers are
 * clamped to their range. A settings file from an older or newer version
 * therefore never breaks startup. When no spelling languages are stored, as
 * on first launch, they come from `systemLanguages` (BCP 47 tags, most
 * preferred first).
 */
export function normalizeSettings(
    stored: unknown,
    systemLanguages: readonly string[] = [],
): Settings {
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
        antiGlare: number('antiGlare'),
        fontFamily: typeof source.fontFamily === 'string' ? source.fontFamily : '',
        fontSize: number('fontSize'),
        lineHeight: number('lineHeight'),
        columnWidth: number('columnWidth'),
        vim: boolean('vim'),
        typewriter: boolean('typewriter'),
        typewriterAnchor: number('typewriterAnchor'),
        typewriterGlide: number('typewriterGlide'),
        focusMode: boolean('focusMode'),
        spellcheck: boolean('spellcheck'),
        spellingLanguages: normalizeSpellingLanguages(
            source.spellingLanguages,
            systemSpellingLanguages(systemLanguages),
        ),
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
 * The known languages in `stored`, in the order of `spellingLanguages` and
 * without repeats, or `fallback` when none is left.
 */
export function normalizeSpellingLanguages(
    stored: unknown,
    fallback: readonly SpellingLanguage[] = defaultSettings.spellingLanguages,
): SpellingLanguage[] {
    if (!Array.isArray(stored)) return [...fallback];
    const chosen = spellingLanguages
        .map((language) => language.code)
        .filter((code) => stored.includes(code));
    return chosen.length > 0 ? chosen : [...fallback];
}

/**
 * The spelling language for the first system language Ernest has a
 * dictionary for, matched on the language alone (`fr-CA` → `fr`, `en-GB` →
 * `en-US`), or English (US) when there is none.
 */
export function systemSpellingLanguages(systemLanguages: readonly string[]): SpellingLanguage[] {
    for (const tag of systemLanguages) {
        const primary = tag.split(/[-_]/)[0].toLowerCase();
        const match = spellingLanguages.find((language) => language.code.split('-')[0] === primary);
        if (match) return [match.code];
    }
    return [...defaultSettings.spellingLanguages];
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
