import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { search, searchKeymap } from '@codemirror/search';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import {
    drawSelection,
    dropCursor,
    EditorView,
    highlightActiveLine,
    keymap,
} from '@codemirror/view';
import { getCM, vim } from '@replit/codemirror-vim';
import { editorTheme } from './editorTheme';
import { livePreview } from './livePreview';
import { typewriterScrolling } from './typewriter';

export type DocumentKind = 'markdown' | 'plain-text';

export interface EditorOptions {
    vim: boolean;
    typewriter: boolean;
    focusMode: boolean;
    spellcheck: boolean;
    /** Hides Markdown syntax outside the lines being edited. */
    livePreview: boolean;
}

export interface EditorCallbacks {
    onChange(): void;
    /** Vim mode name as the engine reports it: `normal`, `insert`, `visual`, `replace`. */
    onVimModeChange(mode: string): void;
}

/**
 * The CodeMirror view and everything that can be toggled at runtime. Each
 * toggle lives in its own compartment so switching one does not rebuild the
 * others (or lose undo history).
 */
export class WritingEditor {
    readonly view: EditorView;
    private readonly language = new Compartment();
    private readonly vimMode = new Compartment();
    private readonly typewriter = new Compartment();
    private readonly attributes = new Compartment();
    private options: EditorOptions;
    private kind: DocumentKind = 'markdown';

    constructor(
        parent: HTMLElement,
        options: EditorOptions,
        private readonly callbacks: EditorCallbacks,
    ) {
        this.options = options;
        this.view = new EditorView({
            parent,
            state: this.createState(''),
        });
        this.attachVimModeListener();
    }

    /** Replaces the document, starting a fresh undo history. */
    load(text: string, kind: DocumentKind) {
        this.kind = kind;
        this.view.setState(this.createState(text));
        this.attachVimModeListener();
        if (this.options.vim) this.callbacks.onVimModeChange('normal');
        this.view.dispatch({ selection: { anchor: 0 } });
    }

    /** Switches highlighting after a save under a different extension, keeping history. */
    setKind(kind: DocumentKind) {
        this.kind = kind;
        this.view.dispatch({ effects: this.language.reconfigure(this.languageExtension()) });
    }

    /** The document with its original line endings. */
    text(): string {
        return this.view.state.sliceDoc();
    }

    configure(options: EditorOptions) {
        const previous = this.options;
        this.options = options;
        const effects = [];
        if (previous.vim !== options.vim) {
            effects.push(this.vimMode.reconfigure(options.vim ? vim() : []));
        }
        if (previous.typewriter !== options.typewriter) {
            effects.push(
                this.typewriter.reconfigure(options.typewriter ? typewriterScrolling() : []),
            );
        }
        if (previous.livePreview !== options.livePreview) {
            effects.push(this.language.reconfigure(this.languageExtension()));
        }
        if (
            previous.focusMode !== options.focusMode ||
            previous.spellcheck !== options.spellcheck
        ) {
            effects.push(this.attributes.reconfigure(this.attributeExtensions()));
        }
        if (effects.length > 0) this.view.dispatch({ effects });
        if (previous.vim !== options.vim) {
            this.attachVimModeListener();
            this.callbacks.onVimModeChange(options.vim ? 'normal' : '');
        }
    }

    focus() {
        this.view.focus();
    }

    destroy() {
        this.view.destroy();
    }

    private createState(text: string): EditorState {
        return EditorState.create({
            doc: text,
            extensions: [
                // CodeMirror splits on any line break and joins with `\n`
                // unless told otherwise; keep Windows files in CRLF.
                text.includes('\r\n') ? EditorState.lineSeparator.of('\r\n') : [],
                // Vim must come before every other keymap so it sees keys first.
                this.vimMode.of(this.options.vim ? vim() : []),
                history(),
                drawSelection(),
                dropCursor(),
                // Marks the paragraph being written; focus mode dims the rest.
                highlightActiveLine(),
                EditorView.lineWrapping,
                search({ top: false }),
                keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
                this.language.of(this.languageExtension()),
                this.typewriter.of(this.options.typewriter ? typewriterScrolling() : []),
                this.attributes.of(this.attributeExtensions()),
                editorTheme(),
                EditorView.updateListener.of((update) => {
                    if (update.docChanged) this.callbacks.onChange();
                }),
            ],
        });
    }

    private languageExtension(): Extension {
        if (this.kind !== 'markdown') return [];
        return [
            // Fenced code blocks are highlighted in their own language, loaded on demand.
            markdown({ base: markdownLanguage, codeLanguages: languages }),
            this.options.livePreview ? livePreview() : [],
        ];
    }

    private attributeExtensions(): Extension {
        return [
            EditorView.editorAttributes.of({ class: this.options.focusMode ? 'focus-mode' : '' }),
            EditorView.contentAttributes.of({
                spellcheck: this.options.spellcheck ? 'true' : 'false',
                autocorrect: 'off',
                autocapitalize: 'off',
            }),
        ];
    }

    /** The Vim adapter is per state, so the listener is re-attached after every `setState`. */
    private attachVimModeListener() {
        const adapter = getCM(this.view);
        if (!adapter) return;
        adapter.on('vim-mode-change', (event: { mode: string; subMode?: string }) => {
            this.callbacks.onVimModeChange(
                event.subMode ? `${event.mode} ${event.subMode}` : event.mode,
            );
        });
    }
}

export function documentKindForPath(path: string | undefined): DocumentKind {
    if (!path) return 'markdown';
    return /\.(md|markdown|mdown|mkd|mdx)$/i.test(path) ? 'markdown' : 'plain-text';
}
