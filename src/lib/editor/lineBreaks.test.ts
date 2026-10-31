import { history, redo, undo } from '@codemirror/commands';
import { EditorSelection, EditorState, type Transaction } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { lineBreakInsertions, withLineFeeds } from './lineBreaks';

function crlfState(doc: string): EditorState {
    return EditorState.create({
        doc,
        extensions: [EditorState.lineSeparator.of('\r\n'), lineBreakInsertions()],
    });
}

describe('lineBreakInsertions', () => {
    it('turns a lone line feed inserted into a CRLF document into a line break', () => {
        const state = crlfState('one\r\ntwo');
        const changed = state.update({ changes: { from: 3, insert: '\n- added' } }).state;

        expect(changed.doc.lines).toBe(3);
        expect(changed.sliceDoc()).toBe('one\r\n- added\r\ntwo');
    });

    it('accepts CR and CRLF in inserted text too', () => {
        const state = crlfState('one');
        const changed = state.update({ changes: { from: 3, insert: '\rtwo\r\nthree' } }).state;

        expect(changed.sliceDoc()).toBe('one\r\ntwo\r\nthree');
    });

    it('keeps positions, so a selection set with the change lands where intended', () => {
        const state = crlfState('one\r\ntwo');
        const changed = state.update({
            changes: { from: 3, insert: '\n- ' },
            selection: EditorSelection.cursor(6),
        }).state;

        expect(changed.selection.main.head).toBe(6);
        expect(changed.doc.lineAt(6).text).toBe('- ');
    });

    it('keeps a selection set inside the inserted text where it was', () => {
        const state = crlfState('one\r\ntwo');
        const changed = state.update({
            changes: { from: 3, insert: '\nab\ncd' },
            selection: EditorSelection.cursor(6),
        }).state;

        expect(changed.doc.lines).toBe(4);
        expect(changed.selection.main.head).toBe(6);
        expect(changed.sliceDoc(4, 6)).toBe('ab');
    });

    it('fixes every change of a transaction', () => {
        const state = crlfState('one\r\ntwo');
        const changed = state.update({
            changes: [
                { from: 0, insert: 'zero\n' },
                { from: 7, insert: '\nthree' },
            ],
        }).state;

        expect(changed.sliceDoc()).toBe('zero\r\none\r\ntwo\r\nthree');
    });

    it('keeps the user event and undoes and redoes as one step', () => {
        let state = EditorState.create({
            doc: 'one\r\ntwo',
            extensions: [EditorState.lineSeparator.of('\r\n'), lineBreakInsertions(), history()],
        });
        const transaction = state.update({
            changes: { from: 3, insert: '\n- a' },
            userEvent: 'input.paste',
        });
        expect(transaction.isUserEvent('input.paste')).toBe(true);
        state = transaction.state;
        const dispatch = (next: Transaction) => (state = next.state);

        undo({ state, dispatch });
        expect(state.sliceDoc()).toBe('one\r\ntwo');
        redo({ state, dispatch });
        expect(state.sliceDoc()).toBe('one\r\n- a\r\ntwo');
        expect(state.doc.lines).toBe(3);
    });

    it('leaves documents with LF endings alone', () => {
        const state = EditorState.create({ doc: 'one', extensions: lineBreakInsertions() });
        const changed = state.update({ changes: { from: 3, insert: '\ntwo' } }).state;

        expect(changed.sliceDoc()).toBe('one\ntwo');
    });
});

describe('withLineFeeds', () => {
    it('writes every line break as a line feed', () => {
        expect(withLineFeeds('a\r\nb\rc\nd')).toBe('a\nb\nc\nd');
    });
});
