import { describe, expect, it } from 'vitest';
import { defaultSettings, fontFamilyStack, normalizeSettings } from './settings';

describe('normalizeSettings', () => {
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
        });
        expect(settings.theme).toBe(defaultSettings.theme);
        expect(settings.fontSize).toBe(40);
        expect(settings.columnWidth).toBe(defaultSettings.columnWidth);
        expect(settings.typewriter).toBe(defaultSettings.typewriter);
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
