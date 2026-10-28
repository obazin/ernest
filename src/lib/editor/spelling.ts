import { syntaxTree } from '@codemirror/language';
import { RangeSetBuilder, StateEffect, type EditorState, type Extension } from '@codemirror/state';
import {
    Decoration,
    ViewPlugin,
    type DecorationSet,
    type EditorView,
    type ViewUpdate,
} from '@codemirror/view';
import type { Tree } from '@lezer/common';
import { backend } from '../backend';

/**
 * Spell checking against the dictionary the backend bundles (en_US Hunspell
 * plus the writer's own words). The webview's native checker cannot be
 * queried for misspellings or suggestions, which the Vim keys need, so
 * Ernest draws its own underlines.
 *
 * The frontend finds the words, skipping code, URLs and HTML, and asks the
 * backend about the ones it has not seen; answers are cached per word for
 * the session, so scrolling and typing only ever send new words.
 */

export interface Word {
    from: number;
    to: number;
    /** As checked: curly apostrophes made straight. */
    text: string;
}

/** Markdown nodes whose text is not prose. */
const skippedNodes = new Set([
    'InlineCode',
    'FencedCode',
    'CodeBlock',
    'URL',
    'Autolink',
    'Comment',
    'CommentBlock',
    'HTMLTag',
    'HTMLBlock',
    'ProcessingInstruction',
    'LinkReference',
]);

/** Ranges of `tree` between `from` and `to` that hold code, URLs or HTML. */
export function skippedRanges(tree: Tree, from: number, to: number): [number, number][] {
    const ranges: [number, number][] = [];
    tree.iterate({
        from,
        to,
        enter: (node) => {
            if (!skippedNodes.has(node.name)) return undefined;
            ranges.push([node.from, node.to]);
            return false;
        },
    });
    return ranges;
}

/** Runs of letters, digits, underscores and apostrophes; only all-letter ones are words. */
const token = /[\p{L}\p{M}\p{N}_'’]+/gu;
const letters = /^\p{L}[\p{L}\p{M}'’]*$/u;
/** Bare URLs, e-mail addresses and paths, which the Markdown tree does not mark. */
const notProse =
    /[\w.+-]+:\/\/\S+|[\w.+-]+@[\w-]+\.[\w.-]+|\bwww\.\S+|(?<![\w:])(?:~|\.{1,2})?\/[^\s/]+\/\S*/gu;

/**
 * The words in `text` (which starts at document offset `offset`) worth
 * checking: at least two letters, not touching digits or underscores, and
 * outside `skipped` ranges and URLs. Hyphenated words are checked by part.
 */
export function wordsIn(text: string, offset: number, skipped: [number, number][] = []): Word[] {
    const excluded = [...skipped];
    for (const match of text.matchAll(notProse)) {
        excluded.push([offset + match.index, offset + match.index + match[0].length]);
    }
    const words: Word[] = [];
    for (const match of text.matchAll(token)) {
        // Apostrophes around a word are quotes, not part of it.
        const raw = match[0];
        const leading = raw.length - raw.replace(/^['’]+/, '').length;
        const trimmed = raw.replace(/^['’]+|['’]+$/g, '');
        if (trimmed.length < 2 || !letters.test(trimmed)) continue;
        const from = offset + match.index + leading;
        const to = from + trimmed.length;
        if (excluded.some(([start, end]) => from < end && to > start)) continue;
        words.push({ from, to, text: trimmed.replace(/’/g, "'") });
    }
    return words;
}

/** Answers per word, shared by every editor for the session. */
const known = new Map<string, boolean>();
/** Words ignored for the session (Vim's `zG`). */
const ignored = new Set<string>();

export function isMisspelled(word: string): boolean {
    return known.get(word) === false && !ignored.has(word);
}

/** Asks the backend about the words not answered yet. */
export async function checkWords(words: Iterable<string>): Promise<void> {
    const unknown = [...new Set(words)].filter((word) => !known.has(word));
    if (unknown.length === 0) return;
    const answers = await backend.checkWords(unknown);
    unknown.forEach((word, index) => known.set(word, answers[index]));
}

/** The words of the whole document (or of `from`–`to`), skipping non-prose. */
export function documentWords(state: EditorState, from = 0, to = state.doc.length): Word[] {
    const skipped = skippedRanges(syntaxTree(state), from, to);
    const words: Word[] = [];
    // Line by line, so a token never spans a line break.
    for (let line = state.doc.lineAt(from); ; line = state.doc.line(line.number + 1)) {
        words.push(...wordsIn(line.text, line.from, skipped));
        if (line.to >= to || line.number === state.doc.lines) break;
    }
    return words;
}

/** Re-draws the underlines in every editor, after answers arrive or the word lists change. */
export const spellingChanged = StateEffect.define<null>();

const misspelledMark = Decoration.mark({ class: 'cm-misspelled' });

function underlines(view: EditorView, words: Word[]): DecorationSet {
    const head = view.state.selection.main.head;
    const builder = new RangeSetBuilder<Decoration>();
    for (const word of words) {
        // The word being typed is not judged until it is finished.
        if (view.hasFocus && word.to === head) continue;
        if (isMisspelled(word.text)) builder.add(word.from, word.to, misspelledMark);
    }
    return builder.finish();
}

const CHECK_DELAY_MS = 300;

const underliner = ViewPlugin.fromClass(
    class {
        decorations: DecorationSet = Decoration.none;
        private words: Word[] = [];
        private timer: ReturnType<typeof setTimeout> | undefined;

        constructor(private readonly view: EditorView) {
            this.collect();
            this.schedule();
        }

        update(update: ViewUpdate) {
            const redraw =
                update.docChanged ||
                update.viewportChanged ||
                update.selectionSet ||
                update.focusChanged ||
                update.transactions.some((transaction) =>
                    transaction.effects.some((effect) => effect.is(spellingChanged)),
                );
            if (!redraw) return;
            if (update.docChanged || update.viewportChanged) {
                this.collect();
                this.schedule();
            }
            this.decorations = underlines(this.view, this.words);
        }

        destroy() {
            clearTimeout(this.timer);
        }

        /** The words in the rendered part of the document. */
        private collect() {
            this.words = this.view.visibleRanges.flatMap(({ from, to }) =>
                documentWords(this.view.state, from, to),
            );
            this.decorations = underlines(this.view, this.words);
        }

        /** Checks new words once typing or scrolling pauses. */
        private schedule() {
            clearTimeout(this.timer);
            this.timer = setTimeout(() => {
                const before = known.size;
                checkWords(this.words.map((word) => word.text))
                    .then(() => {
                        if (known.size !== before) {
                            this.view.dispatch({ effects: spellingChanged.of(null) });
                        }
                    })
                    .catch(() => {
                        // No underlines is better than an error over every edit.
                    });
            }, CHECK_DELAY_MS);
        }
    },
    { decorations: (plugin) => plugin.decorations },
);

export function spellChecking(): Extension {
    return underliner;
}
