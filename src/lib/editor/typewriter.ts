import { EditorState, StateEffect, StateField, type Extension } from '@codemirror/state';
import { EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { config, easings } from '../config';

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
 *
 * Navigation (a click, arrow keys, paragraph jumps, search) glides to the new
 * line; typing and resizing jump, so the line being written never lags.
 */
const centreEveryScroll = EditorView.scrollHandler.of((view, range) => {
    const bounds = view.scrollDOM.getBoundingClientRect();
    const target =
        view.scrollDOM.scrollTop +
        visualLineCentre(view, range.head) -
        (bounds.top + bounds.height / 2);
    if (
        view.state.field(scrollStyle, false) === 'animated' &&
        glideDuration > 0 &&
        !prefersReducedMotion()
    ) {
        glideTo(view, range.head, target);
    } else {
        stopGlide(view);
        view.scrollDOM.scrollTop = target;
    }
    return true;
});

type ScrollStyle = 'instant' | 'animated';

/** Forces the next centring to jump, for scrolls the cursor did not cause. */
const instantScroll = StateEffect.define<null>();

/**
 * How the cursor last moved: `animated` when only the selection changed,
 * `instant` when the text changed. Scroll-only transactions (Vim's own
 * "make it visible" after a motion) keep the style of the move before them.
 */
const scrollStyle = StateField.define<ScrollStyle>({
    create: () => 'instant',
    update(style, transaction) {
        if (transaction.effects.some((effect) => effect.is(instantScroll))) return 'instant';
        if (transaction.docChanged) return 'instant';
        if (transaction.selection) return 'animated';
        return style;
    },
});

const glideDuration = config.typewriter.glide.durationMs;
const glideEasing = easings[config.typewriter.glide.easing];

interface Glide {
    frame: number;
    target: number;
}

const glides = new WeakMap<EditorView, Glide>();

function glideTo(view: EditorView, position: number, target: number) {
    const running = glides.get(view);
    // Vim requests a second scroll to the same place right after each motion;
    // restarting would make every step take twice as long.
    if (running && Math.abs(running.target - target) < 1) return;
    stopGlide(view);

    const scroller = view.scrollDOM;
    const start = scroller.scrollTop;
    const startTime = performance.now();
    const glide: Glide = { frame: 0, target };
    const step = (now: number) => {
        const progress = Math.min(1, (now - startTime) / glideDuration);
        scroller.scrollTop = start + (target - start) * glideEasing(progress);
        if (progress < 1) {
            glide.frame = requestAnimationFrame(step);
            return;
        }
        glides.delete(view);
        settle(view, position);
    };
    glide.frame = requestAnimationFrame(step);
    glides.set(view, glide);
}

function stopGlide(view: EditorView) {
    const running = glides.get(view);
    if (!running) return;
    cancelAnimationFrame(running.frame);
    glides.delete(view);
}

/**
 * Corrects the last few pixels once a glide ends: a target outside the
 * rendered viewport was only a height-map estimate, and the real line
 * heights are known once it has scrolled into view.
 */
function settle(view: EditorView, position: number) {
    view.requestMeasure({
        read: (view) => {
            const bounds = view.scrollDOM.getBoundingClientRect();
            return visualLineCentre(view, position) - (bounds.top + bounds.height / 2);
        },
        write: (offset, view) => {
            if (Math.abs(offset) >= 1) view.scrollDOM.scrollTop += offset;
        },
    });
}

function prefersReducedMotion(): boolean {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

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
                update.view.dispatch({
                    effects: [instantScroll.of(null), EditorView.scrollIntoView(head)],
                });
            });
        }
    },
);

export function typewriterScrolling(): Extension {
    return [scrollStyle, centreEveryScroll, scrollOnCursorMove, centreOnGeometryChange];
}
