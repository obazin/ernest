import { moveLineDown, moveLineUp } from '@codemirror/commands';
import { CodeMirror, Vim } from '@replit/codemirror-vim';
import { mapCommand, viewOf, type ActionFunction } from './engine';

/**
 * Visual `J` / `K` move the selected lines down or up, keeping them
 * selected; a count moves them further. Normal-mode `J` (join lines) and `K`
 * keep their meaning.
 */
function moveSelectedLines(forward: boolean): ActionFunction {
    return (cm, actionArgs, vim) => {
        const view = viewOf(cm);
        const move = forward ? moveLineDown : moveLineUp;
        let moved = 0;
        while (moved < (actionArgs.repeat ?? 1) && move(view)) moved++;
        // The engine redraws the visual selection from its own record of
        // it, so shift that record along with the lines.
        const delta = forward ? moved : -moved;
        const { anchor, head } = vim.sel;
        vim.sel = {
            anchor: new CodeMirror.Pos(anchor.line + delta, anchor.ch),
            head: new CodeMirror.Pos(head.line + delta, head.ch),
        };
    };
}

export function registerMoveLines() {
    Vim.defineAction('ernestMoveLinesDown', moveSelectedLines(true));
    Vim.defineAction('ernestMoveLinesUp', moveSelectedLines(false));
    mapCommand('J', 'action', 'ernestMoveLinesDown', {}, { context: 'visual' });
    mapCommand('K', 'action', 'ernestMoveLinesUp', {}, { context: 'visual' });
}
