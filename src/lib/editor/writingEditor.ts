import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { codeFolding } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { search, searchKeymap } from '@codemirror/search';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import { drawSelection, dropCursor, EditorView, keymap } from '@codemirror/view';
import { getCM, vim } from '@replit/codemirror-vim';
import { editorTheme } from './editorTheme';
import { focusPoint } from './focusPoint';
import { livePreview } from './livePreview';
import type { SpellingLanguage } from '../settings';
import { setSpellingLanguages, spellChecking, spellingRecheck } from './spelling';
import { typewriterScrolling } from './typewriter';
import { spellingSuggestions } from './vim/spellingKeys';
import { yankFlash } from './vim/yankFlash';

export type DocumentKind = 'markdown' | 'plain-text';

export interface EditorOptions {
    vim: boolean;
    typewriter: boolean;
    /** Where typewriter scrolling holds the cursor line, in percent of the window height. */
    typewriterAnchor: number;
    /** How long typewriter scrolling glides to a new line, in milliseconds. */
    typewriterGlide: number;
    /** Tracks the point the focus overlay centres on (`focusPoint`). */
    focusMode: boolean;
    spellcheck: boolean;
    spellingLanguages: readonly SpellingLanguage[];
    /** Hides Markdown syntax outside the lines being edited. */
    livePreview: boolean;
}

export interface EditorCallbacks {
    onChange(): void;
    /** Vim mode name as the engine reports it: `normal`, `insert`, `visual`, `replace`. */
    onVimModeChange(mode: string): void;
    /** Screen y the focus overlay centres on, reported while focus mode is on. */
    onFocusPointMove(y: number): void;
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
    private readonly focusTracking = new Compartment();
    private readonly spelling = new Compartment();
    private options: EditorOptions;
    private kind: DocumentKind = 'markdown';

    constructor(
        parent: HTMLElement,
        options: EditorOptions,
        private readonly callbacks: EditorCallbacks,
    ) {
        this.options = options;
        setSpellingLanguages(options.spellingLanguages);
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
            effects.push(this.vimMode.reconfigure(this.vimExtensions()));
        }
        if (
            previous.typewriter !== options.typewriter ||
            previous.typewriterAnchor !== options.typewriterAnchor ||
            previous.typewriterGlide !== options.typewriterGlide
        ) {
            effects.push(this.typewriter.reconfigure(this.typewriterExtension()));
        }
        if (previous.livePreview !== options.livePreview) {
            effects.push(this.language.reconfigure(this.languageExtension()));
        }
        if (previous.focusMode !== options.focusMode) {
            effects.push(this.focusTracking.reconfigure(this.focusExtension()));
        }
        if (previous.spellcheck !== options.spellcheck) {
            effects.push(this.spelling.reconfigure(options.spellcheck ? spellChecking() : []));
        }
        if (setSpellingLanguages(options.spellingLanguages) && options.spellcheck) {
            effects.push(spellingRecheck.of(null));
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
                this.vimMode.of(this.vimExtensions()),
                history(),
                drawSelection(),
                dropCursor(),
                EditorView.lineWrapping,
                search({ top: false }),
                keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
                this.language.of(this.languageExtension()),
                this.typewriter.of(this.typewriterExtension()),
                this.attributes.of(this.attributeExtensions()),
                this.focusTracking.of(this.focusExtension()),
                this.spelling.of(this.options.spellcheck ? spellChecking() : []),
                editorTheme(),
                EditorView.updateListener.of((update) => {
                    if (update.docChanged) this.callbacks.onChange();
                }),
            ],
        });
    }

    private vimExtensions(): Extension {
        if (!this.options.vim) return [];
        return [vim(), yankFlash(), spellingSuggestions()];
    }

    private languageExtension(): Extension {
        if (this.kind !== 'markdown') return [];
        return [
            // Fenced code blocks are highlighted in their own language, loaded on demand.
            markdown({ base: markdownLanguage, codeLanguages: languages }),
            // Headings fold their section (Vim's zc, zo, za, zM, zR).
            codeFolding({ placeholderText: '…' }),
            this.options.livePreview ? livePreview() : [],
        ];
    }

    private typewriterExtension(): Extension {
        return this.options.typewriter
            ? typewriterScrolling(this.options.typewriterAnchor, this.options.typewriterGlide)
            : [];
    }

    private focusExtension(): Extension {
        return this.options.focusMode ? focusPoint(this.callbacks.onFocusPointMove) : [];
    }

    private attributeExtensions(): Extension {
        return [
            EditorView.contentAttributes.of({
                // Ernest checks spelling itself (`spelling.ts`); the native
                // checker would underline the same words a second time.
                spellcheck: 'false',
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
