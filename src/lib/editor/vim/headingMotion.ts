import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import type { Tree } from '@lezer/common';
import { Vim } from '@replit/codemirror-vim';
import { mapCommand, offsetOf, positionAt, viewOf, type MotionFunction } from './engine';

/**
 * `]]` / `[[`: jump to the next or previous Markdown heading. Vim moves
 * between sections with these keys, and in a document a section starts at a
 * heading. As a motion it composes: `d]]` deletes to the next heading, `v[[`
 * selects back to the previous one.
 */

const headingNode = /^(ATXHeading[1-6]|SetextHeading[12])$/;

/** Start offsets of every heading, in document order. Code blocks hold no headings in the tree. */
export function headingStarts(tree: Tree): number[] {
    const starts: number[] = [];
    tree.iterate({
        enter: (node) => {
            if (headingNode.test(node.name)) {
                starts.push(node.from);
                return false;
            }
            return undefined;
        },
    });
    return starts;
}

/**
 * The `count`th heading after (or before) `from`, or the end (or start) of
 * the document when there are not that many, as Vim does past the last
 * section. `from` inside a heading line counts as on that heading.
 */
export function findHeading(
    starts: readonly number[],
    from: number,
    forward: boolean,
    count: number,
    documentLength: number,
): number {
    const candidates = forward
        ? starts.filter((start) => start > from)
        : starts.filter((start) => start < from).reverse();
    return candidates[count - 1] ?? (forward ? documentLength : 0);
}

const moveToHeading: MotionFunction = (cm, head, motionArgs) => {
    const { state } = viewOf(cm);
    // Parse the whole document if it is not yet, so far headings are found.
    const tree = ensureSyntaxTree(state, state.doc.length, 200) ?? syntaxTree(state);
    const from = state.doc.lineAt(offsetOf(cm, head)).from;
    const target = findHeading(
        headingStarts(tree),
        from,
        Boolean(motionArgs.forward),
        motionArgs.repeat,
        state.doc.length,
    );
    return positionAt(cm, target);
};

export function registerHeadingMotion() {
    Vim.defineMotion('ernestHeading', moveToHeading);
    for (const context of ['normal', 'visual', 'operatorPending'] as const) {
        mapCommand(
            ']]',
            'motion',
            'ernestHeading',
            { forward: true, toJumplist: true },
            { context },
        );
        mapCommand(
            '[[',
            'motion',
            'ernestHeading',
            { forward: false, toJumplist: true },
            { context },
        );
    }
}
