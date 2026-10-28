import { describe, expect, it } from 'vitest';
import { defaultSettings, fontFamilyStack, isEscapeSequence, normalizeSettings } from './settings';

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
            typewriter: 'yes',
            vimClipboard: 0,
        });
        expect(settings.theme).toBe(defaultSettings.theme);
        expect(settings.fontSize).toBe(40);
        expect(settings.columnWidth).toBe(defaultSettings.columnWidth);
        expect(settings.typewriter).toBe(defaultSettings.typewriter);
        expect(settings.vimClipboard).toBe(defaultSettings.vimClipboard);
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
