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

    it('keeps numbers whole across their separators', () => {
        expect(countWords('Section 1.2 costs 10,000 euros at 9:30')).toBe(7);
        expect(countWords('Pi is 3.14.')).toBe(3);
    });

    it('still splits words joined by punctuation without spaces', () => {
        expect(countWords('end.Start one,two')).toBe(4);
    });

    it('counts link and image text but not their destinations', () => {
        expect(countWords('See [the guide](https://example.com/a-b "Title") now')).toBe(4);
        expect(countWords('![a cat](cat.png)')).toBe(2);
    });

    it('counts a bare URL as one word', () => {
        expect(countWords('Visit https://example.com/path?q=1 or www.example.org today')).toBe(5);
        expect(countWords('<https://example.com/a-b>')).toBe(1);
    });

    it('keeps link destinations to one token, parentheses and all', () => {
        expect(
            countWords('[Ernest](https://en.wikipedia.org/wiki/Ernest_(disambiguation)) here'),
        ).toBe(2);
        expect(countWords('[a doc](<my file.md>) end')).toBe(3);
    });

    it('does not let a stray `](` swallow the words after it', () => {
        expect(countWords('[x](a\n\nb c d) e')).toBe(6);
        expect(countWords('array[0](x y z)')).toBe(5);
    });

    it('stays fast on a document full of unclosed `](`', () => {
        const text = 'word ]( '.repeat(30_000);
        const started = performance.now();
        expect(countWords(text)).toBe(30_000);
        expect(performance.now() - started).toBeLessThan(500);
    });
});
