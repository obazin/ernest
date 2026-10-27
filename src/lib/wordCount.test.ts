import { describe, expect, it } from 'vitest';
import { countWords } from './wordCount';

describe('countWords', () => {
    it('counts nothing in empty or whitespace-only text', () => {
        expect(countWords('')).toBe(0);
        expect(countWords('  \n\t ')).toBe(0);
    });

    it('keeps contractions and hyphenated words whole', () => {
        expect(countWords("Don't stop the well-known writer’s draft")).toBe(6);
    });

    it('ignores Markdown syntax', () => {
        expect(countWords('# Title\n\n- **bold** item\n> quoted _text_\n\n---')).toBe(5);
    });

    it('counts accented and non-Latin words', () => {
        expect(countWords('Café déjà vu, Москва')).toBe(4);
    });
});
