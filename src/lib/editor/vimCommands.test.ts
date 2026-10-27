import { describe, expect, it } from 'vitest';
import { parseExArguments } from './vimCommands';

describe('parseExArguments', () => {
    it('reads the bang and the path', () => {
        expect(parseExArguments('! notes.md')).toEqual({ force: true, argument: 'notes.md' });
        expect(parseExArguments(' notes.md')).toEqual({ force: false, argument: 'notes.md' });
    });

    it('treats a missing or blank argument as none', () => {
        expect(parseExArguments(undefined)).toEqual({ force: false, argument: undefined });
        expect(parseExArguments('!')).toEqual({ force: true, argument: undefined });
    });
});
