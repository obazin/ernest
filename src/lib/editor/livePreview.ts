import { syntaxTree } from '@codemirror/language';
import type { EditorState, Extension, Range } from '@codemirror/state';
import {
    Decoration,
    type DecorationSet,
    EditorView,
    ViewPlugin,
    type ViewUpdate,
    WidgetType,
} from '@codemirror/view';
import type { SyntaxNodeRef } from '@lezer/common';

/**
 * Live preview, as in Obsidian or Neovim's render-markdown: Markdown syntax
 * (`#`, `**`, backticks, `[…](…)`, `>`) is hidden everywhere except on the
 * lines the cursor or selection touches, where it is shown so it can be
 * edited. The text itself never changes; only decorations are added.
 *
 * Revealing whole lines rather than single elements keeps column positions
 * stable while the cursor stays on a line, which Vim motions such as `f*`
 * or `3l` rely on.
 */
export function livePreview(): Extension {
    return [livePreviewPlugin, livePreviewTheme];
}

const livePreviewPlugin = ViewPlugin.fromClass(
    class {
        decorations: DecorationSet;

        constructor(view: EditorView) {
            this.decorations = decorationsFor(view);
        }

        update(update: ViewUpdate) {
            if (
                update.docChanged ||
                update.viewportChanged ||
                update.selectionSet ||
                update.focusChanged ||
                syntaxTree(update.startState) !== syntaxTree(update.state)
            ) {
                this.decorations = decorationsFor(update.view);
            }
        }
    },
    { decorations: (plugin) => plugin.decorations },
);

function decorationsFor(view: EditorView): DecorationSet {
    // An unfocused editor reveals nothing: it reads as a finished page.
    const revealed = view.hasFocus ? revealedLines(view.state) : new Set<number>();
    return markupDecorations(view.state, revealed, view.visibleRanges);
}

/** Line numbers touched by any selection range; their markup stays visible. */
export function revealedLines(state: EditorState): Set<number> {
    const lines = new Set<number>();
    for (const range of state.selection.ranges) {
        const last = state.doc.lineAt(range.to).number;
        for (let line = state.doc.lineAt(range.from).number; line <= last; line++) {
            lines.add(line);
        }
    }
    return lines;
}

/** The decorations that hide or restyle markup within `ranges`, outside the `revealed` lines. */
export function markupDecorations(
    state: EditorState,
    revealed: Set<number>,
    ranges: readonly { from: number; to: number }[],
): DecorationSet {
    const decorations: Range<Decoration>[] = [];
    const text = state.doc;
    const isRevealed = (position: number) => revealed.has(text.lineAt(position).number);

    const hide = (from: number, to: number) => {
        // Replacing across a line break is only allowed for block widgets.
        if (from >= to || text.lineAt(from).number !== text.lineAt(to).number) return;
        if (isRevealed(from)) return;
        decorations.push(hidden.range(from, to));
    };
    const replace = (from: number, to: number, widget: WidgetType) => {
        if (isRevealed(from)) return;
        decorations.push(Decoration.replace({ widget }).range(from, to));
    };
    /** End of the run of spaces starting at `position`, capped at `limit` characters. */
    const skipSpaces = (position: number, limit = Infinity) => {
        let end = position;
        while (
            end < text.length &&
            end - position < limit &&
            text.sliceString(end, end + 1) === ' '
        ) {
            end++;
        }
        return end;
    };

    for (const { from, to } of ranges) {
        syntaxTree(state).iterate({
            from,
            to,
            enter: (node: SyntaxNodeRef) => {
                switch (node.name) {
                    // Quotes keep a bar in the margin, revealed or not, so
                    // their extent stays visible.
                    case 'Blockquote': {
                        const last = text.lineAt(node.to).number;
                        for (let line = text.lineAt(node.from).number; line <= last; line++) {
                            decorations.push(quoteLine.range(text.line(line).from));
                        }
                        return;
                    }

                    // Fenced code keeps its fences: a block of code reads as code.
                    case 'FencedCode':
                    case 'CodeBlock':
                    // Images are left as written until they can be shown.
                    case 'Image':
                        return false;

                    case 'HeaderMark': {
                        const heading = node.node.parent;
                        if (heading?.name.startsWith('SetextHeading')) return;
                        if (node.from === heading?.from) {
                            hide(node.from, skipSpaces(node.to));
                        } else {
                            // Closing `##`: hide it with the spaces before it.
                            let start = node.from;
                            while (start > 0 && text.sliceString(start - 1, start) === ' ') start--;
                            hide(start, node.to);
                        }
                        return;
                    }

                    case 'EmphasisMark':
                    case 'StrikethroughMark':
                        hide(node.from, node.to);
                        return;

                    case 'CodeMark':
                        // Only inline code reaches here; fenced code is skipped above.
                        hide(node.from, node.to);
                        return;

                    case 'Escape':
                        // `\*` shows as `*`.
                        hide(node.from, node.from + 1);
                        return;

                    case 'QuoteMark':
                        hide(node.from, skipSpaces(node.to, 1));
                        return;

                    case 'ListMark':
                        if (node.node.parent?.parent?.name === 'BulletList') {
                            replace(node.from, node.to, bullet);
                        }
                        return;

                    case 'TaskMarker': {
                        const done = /x/i.test(text.sliceString(node.from, node.to));
                        replace(node.from, node.to, done ? taskDone : taskOpen);
                        return;
                    }

                    case 'HorizontalRule':
                        replace(node.from, node.to, rule);
                        return;

                    case 'Link':
                    case 'Autolink':
                        hideLinkMarkup(node, hide);
                        return false;
                }
            },
        });
    }

    return Decoration.set(decorations, true);
}

/**
 * `[text](url "title")` shows as `text`; `[text][label]` likewise; `<url>`
 * shows as `url`. The visible text keeps the link colour from the highlighter.
 */
function hideLinkMarkup(link: SyntaxNodeRef, hide: (from: number, to: number) => void) {
    const marks: { from: number; to: number }[] = [];
    const cursor = link.node.cursor();
    if (cursor.firstChild()) {
        do {
            if (cursor.name === 'LinkMark') marks.push({ from: cursor.from, to: cursor.to });
        } while (cursor.nextSibling());
    }
    if (marks.length === 0) return;
    if (link.name === 'Autolink') {
        for (const mark of marks) hide(mark.from, mark.to);
        return;
    }
    // The opening `[`, then everything from the closing `]` to the end.
    hide(marks[0].from, marks[0].to);
    if (marks.length > 1) hide(marks[1].from, link.to);
}

class TextWidget extends WidgetType {
    constructor(
        readonly text: string,
        private readonly className: string,
    ) {
        super();
    }

    eq(other: TextWidget) {
        return other.text === this.text && other.className === this.className;
    }

    toDOM() {
        const element = document.createElement('span');
        element.className = this.className;
        element.textContent = this.text;
        return element;
    }
}

const hidden = Decoration.replace({});
const bullet = new TextWidget('•', 'cm-preview-bullet');
const taskOpen = new TextWidget('☐', 'cm-preview-task');
const taskDone = new TextWidget('☑', 'cm-preview-task');
const rule = new TextWidget('', 'cm-preview-rule');
const quoteLine = Decoration.line({ class: 'cm-preview-quote' });

const livePreviewTheme = EditorView.theme({
    '.cm-preview-bullet, .cm-preview-task': { color: 'var(--color-muted)' },
    '.cm-preview-rule': {
        display: 'inline-block',
        width: '100%',
        verticalAlign: 'middle',
        borderTop: '1px solid var(--color-border)',
    },
    '.cm-preview-quote': {
        borderLeft: '3px solid var(--color-border)',
        paddingLeft: '1em !important',
    },
});
