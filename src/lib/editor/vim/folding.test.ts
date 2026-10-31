import { codeFolding, foldEffect } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { positionOutsideFolds } from './folding';

const text = '# Chapter\n\nFirst paragraph.\n\nSecond paragraph.\n';
/** The section under the heading, folded from the end of its first line. */
const fold = { from: '# Chapter'.length, to: text.length - 1 };

function folded(): EditorState {
    const state = EditorState.create({ doc: text, extensions: codeFolding() });
    return state.update({ effects: foldEffect.of(fold) }).state;
}

describe('positionOutsideFolds', () => {
    it('moves a position hidden in a fold to the start of the line it hangs from', () => {
        const hidden = text.indexOf('Second');
        expect(positionOutsideFolds(folded(), hidden)).toBe(0);
    });

    it('treats the end of a fold as hidden, where the cursor was left drawn', () => {
        expect(positionOutsideFolds(folded(), fold.to)).toBe(0);
    });

    it('moves out of the outermost of nested folds', () => {
        const inner = { from: text.indexOf('First paragraph.') + 5, to: fold.to };
        const state = folded().update({ effects: foldEffect.of(inner) }).state;
        expect(positionOutsideFolds(state, text.indexOf('Second'))).toBe(0);
    });

    it('leaves visible positions alone, the end of the fold line included', () => {
        const state = folded();
        expect(positionOutsideFolds(state, 3)).toBe(3);
        expect(positionOutsideFolds(state, fold.from)).toBe(fold.from);
    });

    it('leaves every position alone when nothing is folded', () => {
        const state = EditorState.create({ doc: text, extensions: codeFolding() });
        const position = text.indexOf('Second');
        expect(positionOutsideFolds(state, position)).toBe(position);
    });
});
