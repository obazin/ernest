import { describe, expect, it } from 'vitest';
import { continuationPrefix } from './openLine';

describe('continuationPrefix', () => {
    it('continues bullets with their marker and indentation', () => {
        expect(continuationPrefix('- item', true)).toBe('- ');
        expect(continuationPrefix('  * nested', true)).toBe('  * ');
        expect(continuationPrefix('+ plus', false)).toBe('+ ');
    });

    it('opens an unchecked task after a task, checked or not', () => {
        expect(continuationPrefix('- [x] done', true)).toBe('- [ ] ');
        expect(continuationPrefix('- [ ] todo', false)).toBe('- [ ] ');
    });

    it('counts ordered items up below and keeps the number above', () => {
        expect(continuationPrefix('3. step', true)).toBe('4. ');
        expect(continuationPrefix('3) step', false)).toBe('3) ');
    });

    it('continues quotes, nested quotes and lists inside quotes', () => {
        expect(continuationPrefix('> quoted', true)).toBe('> ');
        expect(continuationPrefix('> > deeper', true)).toBe('> > ');
        expect(continuationPrefix('> - item', true)).toBe('> - ');
    });

    it('opens a bare line for plain text and empty items', () => {
        expect(continuationPrefix('Plain paragraph.', true)).toBeNull();
        expect(continuationPrefix('- ', true)).toBeNull();
        expect(continuationPrefix('>', true)).toBeNull();
        expect(continuationPrefix('-not a list', true)).toBeNull();
    });
});
