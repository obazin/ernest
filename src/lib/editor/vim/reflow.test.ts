import { describe, expect, it } from 'vitest';
import { reflow } from './reflow';

const lines = (...text: string[]) => text.join('\n');

describe('reflow', () => {
    it('joins each paragraph into one line and keeps blank lines between them', () => {
        expect(reflow(lines('One', '  two ', 'three.', '', 'Four', 'five.'))).toBe(
            lines('One two three.', '', 'Four five.'),
        );
    });

    it('keeps list items apart and joins their continuation lines', () => {
        expect(reflow(lines('- first', '  item', '- second', '1. third', '   item'))).toBe(
            lines('- first item', '- second', '1. third item'),
        );
    });

    it('joins quote lines within one quote and keeps its marker once', () => {
        expect(reflow(lines('> quoted', '> text', '>', '> more'))).toBe(
            lines('> quoted text', '>', '> more'),
        );
        expect(reflow(lines('> outer', '> > inner'))).toBe(lines('> outer', '> > inner'));
    });

    it('leaves headings, rules, tables, setext underlines and code fences alone', () => {
        const untouched = lines(
            '# Heading',
            'Title',
            '=====',
            '---',
            '| a | b |',
            '| - | - |',
            '```',
            'code line one',
            'code line two',
            '```',
        );
        expect(reflow(untouched)).toBe(untouched);
    });

    it('keeps hard line breaks', () => {
        expect(reflow(lines('Line one  ', 'line two\\', 'line three'))).toBe(
            lines('Line one  ', 'line two\\', 'line three'),
        );
    });

    it('leaves text that is already one line per paragraph unchanged', () => {
        const prose = lines('A paragraph.', '', 'Another.');
        expect(reflow(prose)).toBe(prose);
    });
});
