import { Prec, StateEffect, StateField, type Extension } from '@codemirror/state';
import { EditorView, showTooltip, type Tooltip } from '@codemirror/view';
import { Vim } from '@replit/codemirror-vim';
import { backend } from '../../backend';
import {
    checkWords,
    documentWords,
    findMisspelling,
    ignoreWord,
    isSpellChecking,
    markKnown,
    spellingChanged,
    suggestionsFor,
    wordAt,
    type Word,
} from '../spelling';
import { mapCommand, viewOf, type Adapter } from './engine';

/**
 * Vim's spelling keys over Ernest's spell checker:
 *
 * - `]s` / `[s` jump to the next or previous misspelled word, wrapping;
 * - `z=` lists suggestions for the word under the cursor: a digit or Enter
 *   replaces it, anything else closes the list;
 * - `zg` adds the word to the personal dictionary, `zG` ignores it until
 *   Ernest quits.
 *
 * They work while spell checking is on. `]s` is an action rather than a
 * motion because words not yet checked are asked about first, which takes a
 * round trip to the backend.
 */

/** A message in Vim's prompt area, like the engine's own. */
function show(cm: Adapter, text: string) {
    const message = document.createElement('div');
    message.className = 'cm-vim-message';
    message.textContent = text;
    (cm as unknown as { openNotification(node: Node, options: object): void }).openNotification(
        message,
        { bottom: true, duration: 3000 },
    );
}

function spellingOff(cm: Adapter): boolean {
    if (isSpellChecking(viewOf(cm))) return false;
    show(cm, 'Spell checking is off (Settings → Spell checking)');
    return true;
}

function jumpToMisspelling(forward: boolean) {
    return (cm: Adapter, actionArgs: { repeat?: number }) => {
        if (spellingOff(cm)) return;
        const view = viewOf(cm);
        const words = documentWords(view.state);
        checkWords(words.map((word) => word.text))
            .then(() => {
                const head = view.state.selection.main.head;
                const target = findMisspelling(words, head, forward, actionArgs.repeat ?? 1);
                if (!target) return show(cm, 'No misspelled words');
                // The document may have changed while the words were checked.
                if (view.state.sliceDoc(target.from, target.to) !== target.text) return;
                view.dispatch({
                    selection: { anchor: target.from },
                    effects: [spellingChanged.of(null), EditorView.scrollIntoView(target.from)],
                });
            })
            .catch((error: unknown) => show(cm, String(error)));
    };
}

// ── Suggestions (`z=`) ────────────────────────────────────────────────────

interface Suggestions {
    word: Word;
    replacements: string[];
}

const openSuggestions = StateEffect.define<Suggestions | null>();

const suggestionsField = StateField.define<Suggestions | null>({
    create: () => null,
    update(open, transaction) {
        for (const effect of transaction.effects)
            if (effect.is(openSuggestions)) return effect.value;
        // Any edit or cursor move closes the list.
        return transaction.docChanged || transaction.selection ? null : open;
    },
    provide: (field) =>
        showTooltip.from(field, (open): Tooltip | null =>
            open
                ? {
                      pos: open.word.from,
                      above: false,
                      create: (view) => ({ dom: suggestionsDom(view, open) }),
                  }
                : null,
        ),
});

function suggestionsDom(view: EditorView, open: Suggestions): HTMLElement {
    const dom = document.createElement('div');
    dom.className = 'cm-spelling-suggestions';
    if (open.replacements.length === 0) {
        dom.textContent = `No suggestions for “${open.word.text}”`;
        return dom;
    }
    const list = document.createElement('ol');
    open.replacements.forEach((replacement, index) => {
        const item = document.createElement('li');
        item.textContent = replacement;
        item.addEventListener('mousedown', (event) => {
            event.preventDefault();
            replace(view, open, index);
        });
        list.append(item);
    });
    dom.append(list);
    return dom;
}

function replace(view: EditorView, open: Suggestions, index: number) {
    const replacement = open.replacements[index];
    if (replacement === undefined) return;
    view.dispatch({
        changes: { from: open.word.from, to: open.word.to, insert: replacement },
        selection: { anchor: open.word.from },
        effects: openSuggestions.of(null),
    });
}

/** While the list is open it takes the next key, before Vim sees it. */
const suggestionKeys = Prec.highest(
    EditorView.domEventHandlers({
        keydown(event, view) {
            const open = view.state.field(suggestionsField, false);
            if (!open) return false;
            event.preventDefault();
            if (/^[1-9]$/.test(event.key)) replace(view, open, Number(event.key) - 1);
            else if (event.key === 'Enter') replace(view, open, 0);
            else view.dispatch({ effects: openSuggestions.of(null) });
            return true;
        },
    }),
);

function suggest(cm: Adapter) {
    if (spellingOff(cm)) return;
    const view = viewOf(cm);
    const word = wordAt(view.state, view.state.selection.main.head);
    if (!word) return show(cm, 'No word under the cursor');
    suggestionsFor(word.text)
        .then((replacements) => {
            if (view.state.sliceDoc(word.from, word.to) !== word.text) return;
            view.dispatch({ effects: openSuggestions.of({ word, replacements }) });
        })
        .catch((error: unknown) => show(cm, String(error)));
}

// ── Dictionary (`zg`, `zG`) ───────────────────────────────────────────────

function learn(remember: boolean) {
    return (cm: Adapter) => {
        if (spellingOff(cm)) return;
        const view = viewOf(cm);
        const word = wordAt(view.state, view.state.selection.main.head);
        if (!word) return show(cm, 'No word under the cursor');
        const done = () => {
            view.dispatch({ effects: spellingChanged.of(null) });
            show(cm, `“${word.text}” ${remember ? 'added to the dictionary' : 'ignored'}`);
        };
        if (!remember) {
            ignoreWord(word.text);
            return done();
        }
        backend
            .addToDictionary(word.text)
            .then(() => {
                markKnown(word.text);
                done();
            })
            .catch((error: unknown) => show(cm, String(error)));
    };
}

export function spellingSuggestions(): Extension {
    return [suggestionsField, suggestionKeys];
}

export function registerSpellingKeys() {
    const actions = [
        [']s', 'ernestNextMisspelling', jumpToMisspelling(true)],
        ['[s', 'ernestPreviousMisspelling', jumpToMisspelling(false)],
        ['z=', 'ernestSpellingSuggestions', suggest],
        ['zg', 'ernestAddToDictionary', learn(true)],
        ['zG', 'ernestIgnoreWord', learn(false)],
    ] as const;
    for (const [keys, name, action] of actions) {
        Vim.defineAction(name, action);
        mapCommand(keys, 'action', name, {}, { context: 'normal' });
    }
}
