import { Vim } from '@replit/codemirror-vim';
import { isEscapeSequence } from '../../settings';

/**
 * Leaves insert mode when a short key sequence such as `jk` is typed, so
 * Escape need not be reached for. It is an insert-mode mapping to `<Esc>`:
 * the first key is typed as usual, and taken back if the rest of the
 * sequence follows within the engine's `insertModeEscKeysTimeout` (200 ms).
 */

let applied = '';

export function applyEscapeSequence(keys: string) {
    const next = isEscapeSequence(keys) ? keys : '';
    if (next === applied) return;
    if (applied !== '') Vim.unmap(applied, 'insert');
    if (next !== '') Vim.map(next, '<Esc>', 'insert');
    applied = next;
}
