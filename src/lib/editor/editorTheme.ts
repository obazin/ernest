import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { tags } from '@lezer/highlight';

/**
 * One static editor theme for every palette: colours resolve through the CSS
 * custom properties `applyPalette` writes, and typography through the ones
 * the settings write (`--editor-*`). Changing theme or font is therefore a
 * style change on the root element, never an editor reconfiguration.
 */
const chrome = EditorView.theme({
    '&': {
        height: '100%',
        color: 'var(--color-foreground)',
        backgroundColor: 'var(--color-background)',
        fontSize: 'var(--editor-font-size)',
    },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': {
        fontFamily: 'var(--editor-font-family)',
        lineHeight: 'var(--editor-line-height)',
        overflowX: 'hidden',
        // No scrollbar in a zen page; the wheel, trackpad and keys still scroll.
        scrollbarWidth: 'none',
    },
    '.cm-scroller::-webkit-scrollbar': { display: 'none' },
    // The fixed-width column. `flex: none` stops the scroller's flex layout
    // from stretching the content to the window width.
    '.cm-content': {
        boxSizing: 'border-box',
        flex: 'none',
        width: 'min(var(--editor-column-width), 100%)',
        marginInline: 'auto',
        padding: 'var(--editor-vertical-padding) 0',
        caretColor: 'var(--color-cursor)',
    },
    '.cm-line': { padding: '0' },
    '.cm-cursor, .cm-dropCursor': {
        borderLeftColor: 'var(--color-cursor)',
        borderLeftWidth: '2px',
    },
    '.cm-fat-cursor': {
        background: 'var(--color-cursor) !important',
        color: 'var(--color-background) !important',
    },
    '&:not(.cm-focused) .cm-fat-cursor': {
        background: 'none !important',
        outline: '1px solid var(--color-cursor) !important',
    },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection':
        { backgroundColor: 'var(--color-selection) !important' },
    '.cm-searchMatch': {
        backgroundColor: 'color-mix(in srgb, var(--color-highlight) 30%, transparent)',
    },
    '.cm-searchMatch-selected': {
        backgroundColor: 'color-mix(in srgb, var(--color-highlight) 55%, transparent)',
    },
    // Words the spell checker does not know.
    '.cm-misspelled': {
        textDecoration: 'underline wavy var(--color-accent)',
        textDecorationSkipInk: 'none',
        textUnderlineOffset: '3px',
    },
    // Text just yanked in Vim mode, briefly.
    '.cm-yank-flash': {
        backgroundColor: 'color-mix(in srgb, var(--color-highlight) 45%, transparent)',
    },
    // What stands in for a folded section.
    '.cm-foldPlaceholder': {
        backgroundColor: 'transparent',
        border: 'none',
        color: 'var(--color-muted)',
        padding: '0 0.3em',
    },
    '.cm-placeholder': { color: 'var(--color-muted)' },
    // Vim's `:` / `/` prompt, docked at the bottom like a status line.
    '.cm-panels': {
        backgroundColor: 'var(--color-surface)',
        color: 'var(--color-foreground)',
    },
    '.cm-panels-bottom': { borderTop: '1px solid var(--color-border)' },
    '.cm-vim-panel': {
        padding: '4px 12px',
        fontFamily: 'var(--interface-font-family)',
        fontSize: '13px',
    },
    '.cm-vim-panel input': {
        color: 'var(--color-foreground)',
        fontFamily: 'var(--interface-font-family)',
    },
    // Paragraphs other than the one being written fade back (focus mode).
    '&.focus-mode .cm-line': { transition: 'opacity 160ms ease' },
    '&.focus-mode .cm-line:not(.cm-activeLine)': { opacity: 'var(--editor-dimmed-opacity)' },
    '.cm-activeLine': { backgroundColor: 'transparent' },
});

const markdownHighlight = HighlightStyle.define([
    { tag: tags.heading1, color: 'var(--color-heading)', fontWeight: '700', fontSize: '1.4em' },
    { tag: tags.heading2, color: 'var(--color-heading)', fontWeight: '700', fontSize: '1.2em' },
    { tag: tags.heading3, color: 'var(--color-heading)', fontWeight: '700', fontSize: '1.1em' },
    {
        tag: [tags.heading4, tags.heading5, tags.heading6],
        color: 'var(--color-heading)',
        fontWeight: '700',
    },
    { tag: tags.emphasis, color: 'var(--color-emphasis)', fontStyle: 'italic' },
    { tag: tags.strong, color: 'var(--color-strong)', fontWeight: '700' },
    { tag: tags.strikethrough, textDecoration: 'line-through', color: 'var(--color-muted)' },
    { tag: [tags.link, tags.url], color: 'var(--color-link)' },
    { tag: tags.monospace, color: 'var(--color-code)' },
    { tag: tags.quote, color: 'var(--color-quote)', fontStyle: 'italic' },
    // `#`, `*`, `>`, backticks, list bullets: present but out of the way.
    {
        tag: [tags.processingInstruction, tags.contentSeparator, tags.meta],
        color: 'var(--color-muted)',
    },
    { tag: tags.comment, color: 'var(--color-muted)', fontStyle: 'italic' },
    // Fenced code blocks highlighted by their own language.
    { tag: [tags.keyword, tags.operatorKeyword], color: 'var(--color-accent)' },
    { tag: [tags.string, tags.special(tags.string)], color: 'var(--color-code)' },
    { tag: [tags.number, tags.bool, tags.atom], color: 'var(--color-strong)' },
    { tag: [tags.function(tags.variableName), tags.typeName], color: 'var(--color-link)' },
]);

export function editorTheme(): Extension {
    return [chrome, syntaxHighlighting(markdownHighlight)];
}
