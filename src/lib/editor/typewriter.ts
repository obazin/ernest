import { EditorState, Facet, StateEffect, StateField, type Extension } from '@codemirror/state';
import { EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { config, easings } from '../config';

/**
 * Typewriter scrolling: the line holding the cursor stays at a fixed height
 * of the window, the anchor (40–80 % from the top), and the text moves
 * around it. Near the start of the document the window never scrolls above
 * the text, so scrolling only begins once the text reaches the anchor.
 *
 * Two pieces cooperate:
 *
 * - a scroll handler that turns *every* scroll-into-view request into
 *   "hold this line at the anchor". Requests come from many places
 *   (CodeMirror commands, search, and the Vim engine, which dispatches its
 *   own "make it visible" scroll after each motion), so intercepting the
 *   request is the only place where anchoring cannot be overridden by
 *   whoever scrolls last;
 * - a transaction extender that requests a scroll whenever the cursor moves
 *   or the text changes, for the cases that would not scroll at all (a mouse
 *   click on a visible line).
 *
 * The content carries enough padding below (see `--editor-padding-bottom`)
 * for the last line to reach the anchor.
 *
 * Navigation (a click, arrow keys, paragraph jumps, search) glides to the new
 * line; typing and resizing jump, so the line being written never lags.
 */
const anchorEveryScroll = EditorView.scrollHandler.of((view, range) => {
    const target = Math.max(
        0,
        view.scrollDOM.scrollTop + visualLineCentre(view, range.head) - typewriterAnchorY(view),
    );
    if (view.state.field(scrollStyle, false) === 'animated' && !prefersReducedMotion()) {
        glideTo(view, range.head, target);
    } else {
        stopGlide(view);
        view.scrollDOM.scrollTop = target;
    }
    return true;
});

type ScrollStyle = 'instant' | 'animated';

/** Forces the next anchoring to jump, for scrolls the cursor did not cause. */
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

/** Whether typewriter scrolling is on, i.e. the view anchors the cursor itself. */
export function hasTypewriterScrolling(state: EditorState): boolean {
    return state.field(scrollStyle, false) !== undefined;
}

/** The anchor as a fraction of the window height from the top. */
const anchor = Facet.define<number, number>({
    combine: (values) => values[0] ?? 0.5,
});

/** Screen y of the anchor. */
export function typewriterAnchorY(view: EditorView): number {
    const bounds = view.scrollDOM.getBoundingClientRect();
    return bounds.top + bounds.height * view.state.facet(anchor);
}

/** How long a glide takes, in milliseconds. */
const glideDuration = Facet.define<number, number>({
    combine: (values) => values[0] ?? 120,
});

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
    const duration = view.state.facet(glideDuration);
    const glide: Glide = { frame: 0, target };
    const step = (now: number) => {
        const progress = Math.min(1, (now - startTime) / duration);
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
        read: (view) =>
            Math.max(
                0,
                view.scrollDOM.scrollTop +
                    visualLineCentre(view, position) -
                    typewriterAnchorY(view),
            ),
        write: (target, view) => {
            if (Math.abs(target - view.scrollDOM.scrollTop) >= 1) view.scrollDOM.scrollTop = target;
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

/** Re-anchors after the window is resized or the font changes. */
const anchorOnGeometryChange = ViewPlugin.fromClass(
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

/**
 * Typewriter scrolling around an anchor `anchorPercent` % from the top of
 * the window, gliding to new lines in `glideMilliseconds`.
 */
export function typewriterScrolling(anchorPercent: number, glideMilliseconds: number): Extension {
    return [
        anchor.of(anchorPercent / 100),
        glideDuration.of(glideMilliseconds),
        scrollStyle,
        anchorEveryScroll,
        scrollOnCursorMove,
        anchorOnGeometryChange,
    ];
}
