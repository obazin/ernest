import type { EditorState } from '@codemirror/state';
import { CodeMirror } from '@replit/codemirror-vim';

/**
 * The Vim engine reads the document through its adapter's `getRange`,
 * `getSelection` and `getSelections`, which join lines with the state's line
 * separator: `\r\n` in a document read with Windows endings. The engine then
 * works on that text as if lines ended in `\n` (`:sort` splits on `\n`,
 * visual `r` replaces every other character, `\r` included, yanks keep the
 * `\r`), leaving stray `\r`s behind. These reads are made to join with `\n`
 * in every document, the form the engine expects and the registers keep;
 * `lineBreakInsertions` turns the line feeds it writes back into the
 * document's own line breaks.
 */

type Position = { line: number; ch: number };

interface Adapter {
    cm6: { state: EditorState };
    indexFromPos(position: Position): number;
}

export function registerLineFeedReads() {
    const prototype = CodeMirror.prototype as unknown as Record<string, unknown>;
    prototype.getRange = function (this: Adapter, start: Position, end: Position) {
        return this.cm6.state.doc.sliceString(this.indexFromPos(start), this.indexFromPos(end));
    };
    prototype.getSelections = function (this: Adapter) {
        const { state } = this.cm6;
        return state.selection.ranges.map((range) => state.doc.sliceString(range.from, range.to));
    };
    prototype.getSelection = function (this: Adapter & { getSelections(): string[] }) {
        return this.getSelections().join('\n');
    };
}
