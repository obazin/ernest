import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';

/**
 * Typewriter scrolling: the line holding the cursor stays at the vertical
 * centre of the window, and the text moves around it.
 *
 * Two pieces cooperate:
 *
 * - a scroll handler that turns *every* scroll-into-view request into
 *   "centre this line". Requests come from many places (CodeMirror commands,
 *   search, and the Vim engine, which dispatches its own "make it visible"
 *   scroll after each motion), so intercepting the request is the only place
 *   where centring cannot be overridden by whoever scrolls last;
 * - a transaction extender that requests a scroll whenever the cursor moves
 *   or the text changes, for the cases that would not scroll at all (a mouse
 *   click on a visible line).
 *
 * The content carries half a window of padding above and below (see
 * `--editor-vertical-padding`) so the first and last lines can reach centre.
 */
const centreEveryScroll = EditorView.scrollHandler.of((view, range) => {
    const bounds = view.scrollDOM.getBoundingClientRect();
    view.scrollDOM.scrollTop +=
        visualLineCentre(view, range.head) - (bounds.top + bounds.height / 2);
    return true;
});

/**
 * Screen y of the middle of the visual (wrapped) line holding `position`.
 *
 * Scroll handlers run while the view is updating, where `coordsAtPos` and
 * the other measuring APIs throw, so this reads the DOM directly for
 * rendered text and falls back to the height map (the whole paragraph) for
 * positions outside the rendered viewport, e.g. after `G` or a search.
 */
function visualLineCentre(view: EditorView, position: number): number {
    const block = view.lineBlockAt(position);
    const paragraphCentre = view.documentTop + block.top + block.height / 2;
    if (position < view.viewport.from || position > view.viewport.to) return paragraphCentre;
    try {
        const { node, offset } = view.domAtPos(position);
        const caret = document.createRange();
        caret.setStart(node, offset);
        caret.collapse(true);
        const rectangle =
            caret.getClientRects()[0] ??
            (node instanceof Element ? node : node.parentElement)?.getBoundingClientRect();
        if (rectangle && rectangle.height > 0) return (rectangle.top + rectangle.bottom) / 2;
    } catch {
        // Fall through to the paragraph estimate.
    }
    return paragraphCentre;
}

const scrollOnCursorMove = EditorState.transactionExtender.of((transaction) => {
    if (!transaction.selection && !transaction.docChanged) return null;
    return { effects: EditorView.scrollIntoView(transaction.newSelection.main.head) };
});

/** Re-centres after the window is resized or the font changes. */
const centreOnGeometryChange = ViewPlugin.fromClass(
    class {
        private pending = false;

        update(update: ViewUpdate) {
            if (!update.geometryChanged || this.pending) return;
            this.pending = true;
            // Dispatching during an update is not allowed; wait for the frame.
            requestAnimationFrame(() => {
                this.pending = false;
                const head = update.view.state.selection.main.head;
                update.view.dispatch({ effects: EditorView.scrollIntoView(head) });
            });
        }
    },
);

export function typewriterScrolling(): Extension {
    return [centreEveryScroll, scrollOnCursorMove, centreOnGeometryChange];
}
