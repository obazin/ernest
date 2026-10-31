import { describe, expect, it } from 'vitest';
import { antiGlareOpacity, fontFamilyStack } from './appearance';

describe('antiGlareOpacity', () => {
    it('maps the full strength range onto opacities 0 to 0.7', () => {
        expect(antiGlareOpacity(0)).toBe(0);
        expect(antiGlareOpacity(50)).toBeCloseTo(0.35);
        expect(antiGlareOpacity(100)).toBeCloseTo(0.7);
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
