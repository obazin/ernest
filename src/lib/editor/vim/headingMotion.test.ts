import { markdownLanguage } from '@codemirror/lang-markdown';
import { describe, expect, it } from 'vitest';
import { findHeading, headingStarts } from './headingMotion';

const document = [
    '# Title',
    '',
    'Intro.',
    '```',
    '# not a heading',
    '```',
    'Setext',
    '======',
    '',
    '## Second',
].join('\n');

const starts = headingStarts(markdownLanguage.parser.parse(document));
const at = (text: string) => document.indexOf(text);

describe('headingStarts', () => {
    it('finds ATX and setext headings and skips code blocks', () => {
        expect(starts).toEqual([0, at('Setext'), at('## Second')]);
    });
});

describe('findHeading', () => {
    it('finds the next and previous heading', () => {
        expect(findHeading(starts, at('Intro'), true, 1, document.length)).toBe(at('Setext'));
        expect(findHeading(starts, at('Intro'), false, 1, document.length)).toBe(0);
    });

    it('skips the heading the cursor is on and honours a count', () => {
        expect(findHeading(starts, 0, true, 2, document.length)).toBe(at('## Second'));
        expect(findHeading(starts, at('## Second'), false, 2, document.length)).toBe(0);
    });

    it('goes to the end or start of the document past the last heading', () => {
        expect(findHeading(starts, at('## Second'), true, 1, document.length)).toBe(
            document.length,
        );
        expect(findHeading([], 5, false, 1, 10)).toBe(0);
    });
});
