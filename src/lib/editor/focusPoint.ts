import type { Extension } from '@codemirror/state';
import { EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { hasTypewriterScrolling, typewriterAnchorY } from './typewriter';

/**
 * Reports the screen y focus mode centres its overlay on: the typewriter
 * anchor while typewriter scrolling holds the cursor there, otherwise the
 * middle of the cursor's visual line. It reports again whenever the cursor,
 * the text, the layout or the scroll position changes.
 */
export function focusPoint(onMove: (y: number) => void): Extension {
    return ViewPlugin.fromClass(
        class {
            private last = Number.NaN;
            private readonly onScroll = () => this.measure();

            constructor(private readonly view: EditorView) {
                view.scrollDOM.addEventListener('scroll', this.onScroll, { passive: true });
                this.measure();
            }

            update(update: ViewUpdate) {
                if (
                    update.selectionSet ||
                    update.docChanged ||
                    update.geometryChanged ||
                    update.viewportChanged
                ) {
                    this.measure();
                }
            }

            destroy() {
                this.view.scrollDOM.removeEventListener('scroll', this.onScroll);
            }

            private measure() {
                this.view.requestMeasure({
                    read: (view) => {
                        if (hasTypewriterScrolling(view.state)) return typewriterAnchorY(view);
                        const caret = view.coordsAtPos(view.state.selection.main.head);
                        return caret ? (caret.top + caret.bottom) / 2 : null;
                    },
                    write: (y) => {
                        if (y === null || Math.abs(y - this.last) < 0.5) return;
                        this.last = y;
                        onMove(y);
                    },
                });
            }
        },
    );
}
