import { describe, expect, it } from 'vitest';
import { isEscapeSequence } from './escapeSequence';

describe('isEscapeSequence', () => {
    it('accepts two or three keys', () => {
        expect(isEscapeSequence('jk')).toBe(true);
        expect(isEscapeSequence('jjk')).toBe(true);
    });

    it('refuses single keys, long sequences, spaces and key names', () => {
        for (const keys of ['', 'j', 'jklm', 'j k', '<CR>', 'j<']) {
            expect(isEscapeSequence(keys)).toBe(false);
        }
    });
});
