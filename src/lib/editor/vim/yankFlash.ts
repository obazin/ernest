import { StateEffect, StateField, type Extension } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, type DecorationSet } from '@codemirror/view';
import { config } from '../../config';
import { onRegisterWrite } from './registers';

/**
 * Briefly highlights the text just yanked, so `yip` or `y}` shows what it
 * took. The engine selects the yanked ranges before running the yank, so the
 * focused editor's selection at that moment is the yanked text.
 */

const flash = StateEffect.define<{ from: number; to: number }[] | null>();
const flashMark = Decoration.mark({ class: 'cm-yank-flash' });

const flashField = StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update(decorations, transaction) {
        for (const effect of transaction.effects) {
            if (!effect.is(flash)) continue;
            if (effect.value === null) return Decoration.none;
            return Decoration.set(
                effect.value.map(({ from, to }) => flashMark.range(from, to)),
                true,
            );
        }
        return decorations.map(transaction.changes);
    },
    provide: (field) => EditorView.decorations.from(field),
});

/** Editors with the extension; a yank flashes in the focused one. */
const views = new Set<EditorView>();

const tracker = ViewPlugin.define((view) => {
    views.add(view);
    return { destroy: () => views.delete(view) };
});

function flashYank(view: EditorView) {
    const ranges = view.state.selection.ranges.filter((range) => !range.empty);
    if (ranges.length === 0) return;
    const marked = ranges.map(({ from, to }) => ({ from, to }));
    // The engine is mid-command; mark once it has finished.
    queueMicrotask(() => {
        if (views.has(view)) view.dispatch({ effects: flash.of(marked) });
    });
    setTimeout(() => {
        if (views.has(view)) view.dispatch({ effects: flash.of(null) });
    }, config.vim.yankFlash.durationMs);
}

let listening = false;

export function yankFlash(): Extension {
    if (config.vim.yankFlash.durationMs === 0) return [];
    if (!listening) {
        listening = true;
        onRegisterWrite(({ operator }) => {
            if (operator !== 'yank') return;
            for (const view of views) if (view.hasFocus) flashYank(view);
        });
    }
    return [flashField, tracker];
}
