import { describe, expect, it } from 'vitest';
import {
    antiGlareOpacity,
    defaultSettings,
    fontFamilyStack,
    isEscapeSequence,
    normalizeSettings,
    normalizeSpellingLanguages,
    systemSpellingLanguages,
} from './settings';

describe('normalizeSettings', () => {
    it('keeps stored mappings as text and drops anything else', () => {
        expect(normalizeSettings({ vimMappings: 'nmap Y y$' }).vimMappings).toBe('nmap Y y$');
        expect(normalizeSettings({ vimMappings: 42 }).vimMappings).toBe('');
    });

    it('falls back to defaults for anything that is not an object', () => {
        expect(normalizeSettings(null)).toEqual(defaultSettings);
        expect(normalizeSettings('garbage')).toEqual(defaultSettings);
    });

    it('keeps valid values and drops unknown keys', () => {
        const settings = normalizeSettings({ theme: 'nord', vim: false, legacy: 1 });
        expect(settings.theme).toBe('nord');
        expect(settings.vim).toBe(false);
        expect(settings).not.toHaveProperty('legacy');
    });

    it('replaces unknown themes and malformed values, clamps numbers', () => {
        const settings = normalizeSettings({
            theme: 'no-such-theme',
            fontSize: 400,
            columnWidth: Number.NaN,
            typewriterAnchor: 95,
            typewriterGlide: 20,
            antiGlare: -10,
            typewriter: 'yes',
            vimClipboard: 0,
        });
        expect(settings.theme).toBe(defaultSettings.theme);
        expect(settings.fontSize).toBe(40);
        expect(settings.columnWidth).toBe(defaultSettings.columnWidth);
        expect(settings.typewriterAnchor).toBe(80);
        expect(settings.typewriterGlide).toBe(50);
        expect(settings.antiGlare).toBe(0);
        expect(settings.typewriter).toBe(defaultSettings.typewriter);
        expect(settings.vimClipboard).toBe(defaultSettings.vimClipboard);
    });
});

describe('antiGlareOpacity', () => {
    it('maps the full strength range onto opacities 0 to 0.7', () => {
        expect(antiGlareOpacity(0)).toBe(0);
        expect(antiGlareOpacity(50)).toBeCloseTo(0.35);
        expect(antiGlareOpacity(100)).toBeCloseTo(0.7);
    });
});

describe('normalizeSpellingLanguages', () => {
    it('keeps known languages in a fixed order, once each', () => {
        expect(normalizeSpellingLanguages(['es', 'fr', 'es'])).toEqual(['fr', 'es']);
        expect(normalizeSpellingLanguages(['it', 'en-US'])).toEqual(['en-US', 'it']);
    });

    it('falls back to English when nothing usable is stored', () => {
        for (const stored of [undefined, 'fr', [], ['de', 42]]) {
            expect(normalizeSpellingLanguages(stored)).toEqual(['en-US']);
        }
    });
});

describe('systemSpellingLanguages', () => {
    it('takes the first system language with a dictionary, by language alone', () => {
        expect(systemSpellingLanguages(['de-DE', 'fr-CA', 'en-US'])).toEqual(['fr']);
        expect(systemSpellingLanguages(['es-419'])).toEqual(['es']);
        expect(systemSpellingLanguages(['en-GB'])).toEqual(['en-US']);
        expect(systemSpellingLanguages(['it_IT'])).toEqual(['it']);
    });

    it('falls back to English (US)', () => {
        expect(systemSpellingLanguages([])).toEqual(['en-US']);
        expect(systemSpellingLanguages(['ja-JP', 'de'])).toEqual(['en-US']);
    });

    it('skips POSIX locales and empty tags, ignoring case', () => {
        expect(systemSpellingLanguages(['C', 'POSIX', '', 'fR-Fr'])).toEqual(['fr']);
    });
});

describe('spelling languages in normalizeSettings', () => {
    it('takes the system language only when none is stored', () => {
        expect(normalizeSettings({}, ['it-IT']).spellingLanguages).toEqual(['it']);
        expect(
            normalizeSettings({ spellingLanguages: ['es'] }, ['it-IT']).spellingLanguages,
        ).toEqual(['es']);
    });
});

describe('isEscapeSequence', () => {
    it('accepts two or three keys', () => {
        expect(isEscapeSequence('jk')).toBe(true);
        expect(isEscapeSequence('jjk')).toBe(true);
    });

    it('refuses single keys, long sequences, spaces and key names', () => {
        for (const keys of ['', 'j', 'jklm', 'j k', '<CR>', 'j<']) {
            expect(isEscapeSequence(keys)).toBe(false);
        }
    });

    it('drops an invalid stored sequence', () => {
        expect(normalizeSettings({ vimEscapeSequence: 'j' }).vimEscapeSequence).toBe('');
        expect(normalizeSettings({ vimEscapeSequence: 'jk' }).vimEscapeSequence).toBe('jk');
    });
});

describe('fontFamilyStack', () => {
    it('quotes the family and escapes quotes inside it', () => {
        expect(fontFamilyStack('iA Writer "Duo"')).toMatch(/^"iA Writer \\"Duo\\"", /);
    });

    it('uses the fallback stack alone when no family is chosen', () => {
        expect(fontFamilyStack('')).not.toContain('""');
    });
});
