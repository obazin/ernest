import { foldAll, foldCode, toggleFold, unfoldAll, unfoldCode } from '@codemirror/language';
import type { Command } from '@codemirror/view';
import { Vim } from '@replit/codemirror-vim';
import { mapCommand, viewOf } from './engine';

/**
 * Vim's fold keys over what the Markdown language folds: a heading folds
 * its section (down to the next heading of the same or a higher level), and
 * lists, quotes and code blocks fold too. Plain text has nothing to fold.
 * The folding itself comes from `codeFolding()` in the language compartment.
 */
const folds: [keys: string[], name: string, command: Command][] = [
    [['zc', 'zC'], 'ernestFold', foldCode],
    [['zo', 'zO'], 'ernestUnfold', unfoldCode],
    [['za', 'zA'], 'ernestToggleFold', toggleFold],
    [['zM'], 'ernestFoldAll', foldAll],
    [['zR'], 'ernestUnfoldAll', unfoldAll],
];

export function registerFolding() {
    for (const [keys, name, command] of folds) {
        Vim.defineAction(name, (cm) => {
            command(viewOf(cm));
        });
        for (const key of keys) mapCommand(key, 'action', name, {}, { context: 'normal' });
    }
}
