import { describe, expect, it } from 'vitest';
import { firstNonBlankOnDisplayLine } from './displayLines';

describe('firstNonBlankOnDisplayLine', () => {
    it('skips indentation on the first display line of a paragraph', () => {
        expect(firstNonBlankOnDisplayLine('    - item', 100, 100)).toBe(104);
    });

    it('goes to the start of a continuation display line', () => {
        expect(firstNonBlankOnDisplayLine('    - item that wraps', 100, 112)).toBe(112);
    });

    it('stays on the last character of a blank line, and on an empty one', () => {
        expect(firstNonBlankOnDisplayLine('   ', 10, 10)).toBe(12);
        expect(firstNonBlankOnDisplayLine('', 10, 10)).toBe(10);
    });
});
