import { EditorSelection } from '@codemirror/state';
import { Vim } from '@replit/codemirror-vim';
import {
    mapCommand,
    offsetOf,
    positionAt,
    viewOf,
    type Adapter,
    type MotionFunction,
    type Position,
} from './engine';

/**
 * Motions that follow wrapped lines on screen. Every paragraph is one long
 * wrapped line in prose, so the stock linewise `j` jumps a whole paragraph
 * and `$` goes to its end.
 *
 * - `j`/`k` move by display line in normal and visual mode; in
 *   operator-pending mode they stay linewise, so `dj` still deletes two lines.
 *   `gj`/`gk` take over the logical-line moves.
 * - `0`, `^`, `$`, `A`, `I` act on the display line holding the cursor.
 * - `H`/`L` go to the first and last line visible in the window, which the
 *   stock motions get wrong with typewriter padding and long paragraphs.
 */

/**
 * Where `^` lands: the first non-blank character when the display line is
 * the first of its paragraph, otherwise the display line's start (a
 * continuation line has no indentation of its own).
 */
export function firstNonBlankOnDisplayLine(
    lineText: string,
    lineStart: number,
    displayLineStart: number,
): number {
    if (displayLineStart !== lineStart) return displayLineStart;
    const indentation = lineText.length - lineText.trimStart().length;
    return lineStart + Math.min(indentation, Math.max(0, lineText.length - 1));
}

/** Start or end of the display line holding `position`. */
function displayLineBoundary(cm: Adapter, position: Position, forward: boolean): number {
    const view = viewOf(cm);
    const offset = offsetOf(cm, position);
    // At a wrap point an offset belongs to both display lines; `sticky` says which.
    const cursor = EditorSelection.cursor(offset, position.sticky === 'before' ? -1 : 1);
    return view.moveToLineBoundary(cursor, forward, true).head;
}

const moveToDisplayLineBoundary: MotionFunction = (cm, head, motionArgs) => {
    const view = viewOf(cm);
    const line = view.state.doc.lineAt(offsetOf(cm, head));
    const forward = Boolean(motionArgs.forward);
    const boundary = displayLineBoundary(cm, head, forward);
    if (forward) {
        // The cursor sits on the last character, not after it, like `$`.
        return positionAt(cm, Math.max(line.from, boundary - (boundary > line.from ? 1 : 0)));
    }
    const firstNonBlank = (motionArgs as { firstNonBlank?: boolean }).firstNonBlank;
    return positionAt(
        cm,
        firstNonBlank ? firstNonBlankOnDisplayLine(line.text, line.from, boundary) : boundary,
    );
};

const moveToWindowEdge: MotionFunction = (cm, _, motionArgs) => {
    const view = viewOf(cm);
    const bounds = view.scrollDOM.getBoundingClientRect();
    const content = view.contentDOM.getBoundingClientRect();
    const halfLine = view.defaultLineHeight / 2;
    const y = motionArgs.forward ? bounds.bottom - halfLine : bounds.top + halfLine;
    // The padding around the text maps to the nearest position, so the edge
    // clamps to the start or end of the document.
    const edge = view.posAtCoords({ x: content.left + 1, y }, false);
    let cursor = EditorSelection.cursor(edge);
    // A count counts display lines inward from the edge, like `3H`.
    for (let step = 1; step < motionArgs.repeat; step++) {
        cursor = view.moveVertically(cursor, !motionArgs.forward);
    }
    return positionAt(cm, view.moveToLineBoundary(cursor, false, true).head);
};

export function registerDisplayLineMotions() {
    Vim.defineMotion('ernestDisplayLineBoundary', moveToDisplayLineBoundary);
    Vim.defineMotion('ernestWindowEdge', moveToWindowEdge);

    for (const context of ['normal', 'visual'] as const) {
        mapCommand('j', 'motion', 'moveByDisplayLines', { forward: true }, { context });
        mapCommand('k', 'motion', 'moveByDisplayLines', { forward: false }, { context });
        mapCommand('gj', 'motion', 'moveByLines', { forward: true, linewise: true }, { context });
        mapCommand('gk', 'motion', 'moveByLines', { forward: false, linewise: true }, { context });
    }

    for (const context of ['normal', 'visual', 'operatorPending'] as const) {
        const boundary = 'ernestDisplayLineBoundary';
        mapCommand('0', 'motion', boundary, { forward: false }, { context });
        mapCommand('^', 'motion', boundary, { forward: false, firstNonBlank: true }, { context });
        mapCommand('$', 'motion', boundary, { forward: true, inclusive: true }, { context });
        mapCommand(
            'H',
            'motion',
            'ernestWindowEdge',
            { forward: false, toJumplist: true },
            {
                context,
            },
        );
        mapCommand(
            'L',
            'motion',
            'ernestWindowEdge',
            { forward: true, toJumplist: true },
            {
                context,
            },
        );
    }

    // The stock insert action, after moving to the display line's edge: `A`
    // inserts after its last character, `I` before its first non-blank.
    mapCommand(
        'A',
        'action',
        'enterInsertMode',
        { insertAt: 'charAfter' },
        {
            context: 'normal',
            isEdit: true,
            motion: 'ernestDisplayLineBoundary',
            motionArgs: { forward: true },
        },
    );
    mapCommand(
        'I',
        'action',
        'enterInsertMode',
        { insertAt: 'inplace' },
        {
            context: 'normal',
            isEdit: true,
            motion: 'ernestDisplayLineBoundary',
            motionArgs: { forward: false, firstNonBlank: true },
        },
    );
}
