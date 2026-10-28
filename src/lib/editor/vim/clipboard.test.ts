import { describe, expect, it } from 'vitest';
import { isLinewise, usesSystemClipboard } from './clipboard';

describe('usesSystemClipboard', () => {
    it('always backs the + register with the clipboard', () => {
        expect(usesSystemClipboard('+', false)).toBe(true);
        expect(usesSystemClipboard('+', true)).toBe(true);
    });

    it('backs the unnamed register only while sharing is on', () => {
        expect(usesSystemClipboard(undefined, true)).toBe(true);
        expect(usesSystemClipboard('"', true)).toBe(true);
        expect(usesSystemClipboard(undefined, false)).toBe(false);
    });

    it('never touches named or special registers', () => {
        for (const name of ['a', 'Z', '_', '0', '-']) {
            expect(usesSystemClipboard(name, true)).toBe(false);
        }
    });
});

describe('isLinewise', () => {
    it('treats text ending in a line break as whole lines', () => {
        expect(isLinewise('a line\n')).toBe(true);
        expect(isLinewise('a few words')).toBe(false);
    });
});
