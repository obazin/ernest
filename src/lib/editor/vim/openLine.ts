import { markdownLanguage } from '@codemirror/lang-markdown';
import { Vim } from '@replit/codemirror-vim';
import { mapCommand, offsetOf, positionAt, viewOf, type ActionFunction } from './engine';

/**
 * `o` / `O` continue the list or quote the cursor is in: `o` on `- item`
 * opens `- `, on `3. step` opens `4. `, on `> quote` opens `> `. Elsewhere,
 * on an empty item and in plain text they open a bare line as usual.
 */

const item =
    /^(?<indent>\s*)(?<quote>(?:>\s?)*)(?<inner>\s*)(?:(?<bullet>[-*+])\s+(?<task>\[[ xX]\]\s+)?|(?<number>\d+)(?<delimiter>[.)])\s+)?(?<content>.*)$/;

/**
 * The markup a new line opened next to `lineText` starts with, or null when
 * the line is not a list item or quote with text in it. A new task is always
 * unchecked; an ordered item below counts up, one above keeps the number.
 */
export function continuationPrefix(lineText: string, below: boolean): string | null {
    const groups = item.exec(lineText)?.groups;
    if (!groups) return null;
    const { indent, quote, inner, bullet, task, number, delimiter, content } = groups;
    if (!quote && !bullet && !number) return null;
    if (content.trim() === '') return null;
    let marker = '';
    if (bullet) marker = `${bullet} ${task ? '[ ] ' : ''}`;
    else if (number) marker = `${below ? Number(number) + 1 : number}${delimiter} `;
    return `${indent}${quote}${inner}${marker}`;
}

const openLineContinuing: ActionFunction = function (
    this: Record<string, ActionFunction>,
    cm,
    actionArgs,
    vim,
) {
    const view = viewOf(cm);
    const below = Boolean(actionArgs.after);
    const line = view.state.doc.lineAt(offsetOf(cm, cm.getCursor()));
    const prefix = markdownLanguage.isActiveAt(view.state, line.from)
        ? continuationPrefix(line.text, below)
        : null;
    // The engine runs actions with its action table as `this`, which holds
    // the stock `o` / `O` and the insert-mode entry they end with.
    if (prefix === null) return this.newLineAndEnterInsertMode(cm, actionArgs, vim);

    const at = below ? line.to : line.from;
    const insert = below ? `\n${prefix}` : `${prefix}\n`;
    const cursor = below ? line.to + insert.length : line.from + prefix.length;
    cm.replaceRange(insert, positionAt(cm, at));
    cm.setCursor(positionAt(cm, cursor));
    this.enterInsertMode(cm, { repeat: actionArgs.repeat } as typeof actionArgs, vim);
};

export function registerOpenLine() {
    Vim.defineAction('ernestOpenLine', openLineContinuing);
    for (const [keys, after] of [
        ['o', true],
        ['O', false],
    ] as const) {
        mapCommand(
            keys,
            'action',
            'ernestOpenLine',
            { after },
            {
                context: 'normal',
                isEdit: true,
                interlaceInsertRepeat: true,
            },
        );
    }
}
