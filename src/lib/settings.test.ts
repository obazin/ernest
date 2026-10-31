import { describe, expect, it } from 'vitest';
import { defaultSettings, normalizeSettings, normalizeSpellingLanguages } from './settings';

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

describe('spelling languages in normalizeSettings', () => {
    it('takes the system language only when none is stored', () => {
        expect(normalizeSettings({}, ['it-IT']).spellingLanguages).toEqual(['it']);
        expect(
            normalizeSettings({ spellingLanguages: ['es'] }, ['it-IT']).spellingLanguages,
        ).toEqual(['es']);
    });
});

describe('escape sequence in normalizeSettings', () => {
    it('drops an invalid stored sequence', () => {
        expect(normalizeSettings({ vimEscapeSequence: 'j' }).vimEscapeSequence).toBe('');
        expect(normalizeSettings({ vimEscapeSequence: 'jk' }).vimEscapeSequence).toBe('jk');
    });
});
