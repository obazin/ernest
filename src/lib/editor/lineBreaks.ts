import { EditorState, Text, type Extension, type TransactionSpec } from '@codemirror/state';

/**
 * Line breaks in a document read with Windows (CRLF) endings. Such a state is
 * created with `EditorState.lineSeparator.of('\r\n')`, so that saving joins
 * its lines back with `\r\n`; but it then recognises only `\r\n` in inserted
 * text, and a lone `\n` (which the Vim engine and the extensions build their
 * text with, and which other applications put on the clipboard) would stay
 * inside one line and be saved as a stray LF. `lineBreakInsertions` turns
 * every `\n`, `\r` and `\r\n` left inside an inserted line into a real line
 * break, so the file keeps one kind of ending however the text arrived.
 */

/** A line break the state did not split on: `\r\n` inside a line, or a lone `\r` or `\n`. */
const strayLineBreak = /\r\n|\r|\n/g;

const lineBreak = Text.of(['', '']);

/** `text` with every line break written `\n`, the form registers keep. */
export function withLineFeeds(text: string): string {
    return text.replace(/\r\n?/g, '\n');
}

export function lineBreakInsertions(): Extension {
    return EditorState.transactionFilter.of((transaction) => {
        if (!transaction.docChanged || transaction.startState.lineBreak === '\n') {
            return transaction;
        }
        // One fix per stray break, replacing just its characters, so every
        // other position maps exactly: a lone `\r` or `\n` is one position,
        // like the line break it becomes.
        const fixes: { from: number; to: number; insert: Text }[] = [];
        transaction.changes.iterChanges((_fromA, _toA, from, _to, inserted) => {
            let lineStart = from;
            for (const line of inserted.iterLines()) {
                for (const match of line.matchAll(strayLineBreak)) {
                    const at = lineStart + match.index;
                    fixes.push({ from: at, to: at + match[0].length, insert: lineBreak });
                }
                lineStart += line.length + 1;
            }
        });
        if (fixes.length === 0) return transaction;
        // Positions in the fixes refer to the document after the transaction.
        const fix: TransactionSpec = { changes: fixes, sequential: true };
        return [transaction, fix];
    });
}
