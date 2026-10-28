import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorSelection, EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { markupDecorations, revealedLines } from './livePreview';

/** The document as live preview displays it: hidden ranges dropped, widgets as their text. */
function rendered(source: string, revealed: number[] = []): string {
    const state = EditorState.create({
        doc: source,
        extensions: markdown({ base: markdownLanguage }),
    });
    ensureSyntaxTree(state, state.doc.length, 5000);
    const decorations = markupDecorations(state, new Set(revealed), [
        { from: 0, to: state.doc.length },
    ]);
    let output = '';
    let position = 0;
    const cursor = decorations.iter();
    for (; cursor.value; cursor.next()) {
        if (cursor.from === cursor.to) continue; // line decorations
        output += source.slice(position, cursor.from);
        output += (cursor.value.spec.widget as { text?: string } | undefined)?.text ?? '';
        position = cursor.to;
    }
    return output + source.slice(position);
}

describe('markupDecorations', () => {
    it('hides heading, emphasis, strikethrough and inline code markers', () => {
        expect(rendered('# Title ##')).toBe('Title');
        expect(rendered('a **bold** _it_ ~~gone~~ `code`')).toBe('a bold it gone code');
    });

    it('shows links as their text', () => {
        expect(rendered('see [the docs](https://x.org "Docs") now')).toBe('see the docs now');
        expect(rendered('see [the docs][ref]')).toBe('see the docs');
        expect(rendered('<https://x.org>')).toBe('https://x.org');
    });

    it('draws bullets, task boxes and quotes, and keeps escaped characters', () => {
        expect(rendered('- one\n- [ ] two\n- [x] three')).toBe('• one\n• ☐ two\n• ☑ three');
        expect(rendered('1. first')).toBe('1. first');
        expect(rendered('> quoted')).toBe('quoted');
        expect(rendered('\\*literal\\*')).toBe('*literal*');
    });

    it('leaves fenced code and images as written', () => {
        const fenced = '```js\nconst a = `b`;\n```';
        expect(rendered(fenced)).toBe(fenced);
        expect(rendered('![alt](image.png)')).toBe('![alt](image.png)');
    });

    it('keeps markup on revealed lines only', () => {
        expect(rendered('# One\n**two**\n# Three', [2])).toBe('One\n**two**\nThree');
    });
});

describe('revealedLines', () => {
    it('covers every line a selection range touches', () => {
        const state = EditorState.create({
            doc: 'a\nb\nc\nd',
            selection: EditorSelection.create([EditorSelection.range(2, 5)]),
        });
        expect([...revealedLines(state)]).toEqual([2, 3]);
    });
});
