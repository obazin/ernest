import { describe, expect, it } from 'vitest';
import { baseName, documentKindForPath } from './documents';

describe('baseName', () => {
    it('takes the last segment for either separator', () => {
        expect(baseName('/home/writer/notes.md')).toBe('notes.md');
        expect(baseName('C:\\Users\\writer\\draft.txt')).toBe('draft.txt');
        expect(baseName('loose.md')).toBe('loose.md');
    });
});

describe('documentKindForPath', () => {
    it('edits unnamed documents and Markdown extensions as Markdown', () => {
        expect(documentKindForPath(undefined)).toBe('markdown');
        expect(documentKindForPath('/notes/Chapter.MD')).toBe('markdown');
        expect(documentKindForPath('/notes/page.mdx')).toBe('markdown');
    });

    it('edits anything else as plain text', () => {
        expect(documentKindForPath('/notes/todo.txt')).toBe('plain-text');
        expect(documentKindForPath('/notes/md')).toBe('plain-text');
    });
});
