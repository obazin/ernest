import { Vim } from '@replit/codemirror-vim';
import { mapCommand, positionAt, viewOf, type OperatorFunction } from './engine';

/**
 * `gq` / `gw` join each paragraph into one line. The stock operator
 * hard-wraps at 80 columns, which in an editor that wraps on screen leaves
 * exactly the ragged lines the command is reached for to fix. `gqip` joins
 * the paragraph, `gqG` the rest of the document, `Vgq` the selection.
 *
 * Markdown structure is kept: headings, rules, table rows and fenced code
 * stay as they are, every list item stays its own line (its continuation
 * lines join into it), quote lines join within the same quote, and a hard
 * line break (two trailing spaces or a backslash) still ends a line.
 */

const fence = /^\s*(```|~~~)/;
const standalone = /^\s{0,3}(#{1,6}(\s|$)|([-*_])(\s*\3){2,}\s*$|=+\s*$|\|)/;
const listItem = /^\s*([-*+]|\d+[.)])\s+/;
const quotePrefix = /^\s*(>\s?)+/;
const hardBreak = /( {2,}|\\)$/;

export function reflow(text: string): string {
    const output: string[] = [];
    let paragraph: string | null = null;
    let paragraphQuote = '';
    let inFence = false;

    const flush = () => {
        if (paragraph !== null) output.push(paragraph);
        paragraph = null;
    };

    for (const line of text.split('\n')) {
        if (inFence || fence.test(line)) {
            flush();
            output.push(line);
            if (fence.test(line)) inFence = !inFence;
            continue;
        }
        const quote = quotePrefix.exec(line)?.[0] ?? '';
        const body = line.slice(quote.length);
        if (body.trim() === '' || standalone.test(body)) {
            flush();
            output.push(line);
            continue;
        }
        const continues =
            paragraph !== null &&
            quote.trim() === paragraphQuote.trim() &&
            !listItem.test(body) &&
            !hardBreak.test(paragraph);
        if (continues) {
            paragraph = `${paragraph!.trimEnd()} ${body.trimStart()}`;
        } else {
            flush();
            paragraph = line;
            paragraphQuote = quote;
        }
    }
    flush();
    return output.join('\n');
}

const reflowLines: OperatorFunction = (cm, operatorArgs, ranges, oldAnchor) => {
    const view = viewOf(cm);
    const { doc } = view.state;
    const first = Math.min(ranges[0].anchor.line, ranges[0].head.line);
    let last = Math.max(ranges[0].anchor.line, ranges[0].head.line);
    // A linewise range ends at the start of the line after it.
    if (operatorArgs.linewise && last > first) last--;
    const from = doc.line(first + 1).from;
    const to = doc.line(last + 1).to;
    const original = doc.sliceString(from, to);
    const joined = reflow(original);
    if (joined !== original) cm.replaceRange(joined, positionAt(cm, from), positionAt(cm, to));
    if (operatorArgs.keepCursor) return oldAnchor;
    // Like the stock `gq`, leave the cursor at the start of the last formatted line.
    const end = view.state.doc.lineAt(from + joined.length);
    return positionAt(cm, end.from);
};

export function registerReflowOperator() {
    Vim.defineOperator('ernestReflow', reflowLines);
    mapCommand('gq', 'operator', 'ernestReflow', {}, {});
    mapCommand('gw', 'operator', 'ernestReflow', { keepCursor: true }, {});
}
