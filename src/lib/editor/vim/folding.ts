import {
    foldAll,
    foldCode,
    foldedRanges,
    toggleFold,
    unfoldAll,
    unfoldCode,
} from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import type { Command } from '@codemirror/view';
import { Vim } from '@replit/codemirror-vim';
import { mapCommand, positionAt, viewOf } from './engine';

/**
 * Vim's fold keys over what the Markdown language folds: a heading folds
 * its section (down to the next heading of the same or a higher level), and
 * lists, quotes and code blocks fold too. Plain text has nothing to fold.
 * The folding itself comes from `codeFolding()` in the language compartment.
 * A cursor left inside a fold moves to the line the fold hangs from, as in
 * Vim, rather than staying on hidden text.
 */
const folds: [keys: string[], name: string, command: Command][] = [
    [['zc', 'zC'], 'ernestFold', foldCode],
    [['zo', 'zO'], 'ernestUnfold', unfoldCode],
    [['za', 'zA'], 'ernestToggleFold', toggleFold],
    [['zM'], 'ernestFoldAll', foldAll],
    [['zR'], 'ernestUnfoldAll', unfoldAll],
];

/**
 * `position`, or the start of the line a fold hangs from when `position` is
 * hidden inside that fold. The end of the fold's first line stays visible.
 */
export function positionOutsideFolds(state: EditorState, position: number): number {
    let visible = position;
    foldedRanges(state).between(position, position, (from, to) => {
        if (position <= from || position > to) return;
        visible = state.doc.lineAt(from).from;
        return false;
    });
    return visible;
}

export function registerFolding() {
    for (const [keys, name, command] of folds) {
        Vim.defineAction(name, (cm) => {
            const view = viewOf(cm);
            command(view);
            const head = view.state.selection.main.head;
            const visible = positionOutsideFolds(view.state, head);
            if (visible !== head) cm.setCursor(positionAt(cm, visible));
        });
        for (const key of keys) mapCommand(key, 'action', name, {}, { context: 'normal' });
    }
}
