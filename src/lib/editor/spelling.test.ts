import { markdownLanguage } from '@codemirror/lang-markdown';
import { describe, expect, it } from 'vitest';
import { skippedRanges, wordsIn } from './spelling';

const texts = (text: string, skipped: [number, number][] = []) =>
    wordsIn(text, 0, skipped).map((word) => word.text);

describe('wordsIn', () => {
    it('finds words with their offsets', () => {
        expect(wordsIn('Two words', 10)).toEqual([
            { from: 10, to: 13, text: 'Two' },
            { from: 14, to: 19, text: 'words' },
        ]);
    });

    it('keeps inner apostrophes, made straight, and drops quoting ones', () => {
        expect(texts("don't it’s 'quoted'")).toEqual(["don't", "it's", 'quoted']);
    });

    it('checks hyphenated words by part and handles accents', () => {
        expect(texts('well-known café')).toEqual(['well', 'known', 'café']);
    });

    it('skips single letters, numbers and identifiers', () => {
        expect(texts('a 42 v2 snake_case x')).toEqual([]);
    });

    it('skips URLs, e-mail addresses and paths', () => {
        expect(
            texts('see https://example.com/page or me@example.org and ~/notes/draft.md here'),
        ).toEqual(['see', 'or', 'and', 'here']);
        expect(texts('and/or /usr/share/dict')).toEqual(['and', 'or']);
    });

    it('skips words in the given ranges', () => {
        expect(texts('keep skip keep', [[5, 9]])).toEqual(['keep', 'keep']);
    });
});

describe('skippedRanges', () => {
    it('covers code, URLs, HTML and link definitions', () => {
        const text = [
            'Prose `code` [link](http://x.io) <b>bold</b>',
            '',
            '```',
            'fenced',
            '```',
            '',
            '[label]: http://r.io',
        ].join('\n');
        const tree = markdownLanguage.parser.parse(text);
        const skipped = skippedRanges(tree, 0, text.length);
        expect(texts(text, skipped)).toEqual(['Prose', 'link', 'bold']);
    });
});
