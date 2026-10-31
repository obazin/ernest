import { invoke } from '@tauri-apps/api/core';
import type { SpellingLanguage } from './spellingLanguages';

/** Typed wrappers over the Rust commands in `src-tauri/src`. */

export interface DocumentFile {
    path: string;
    text: string;
    /** False for a path that does not exist yet (`:e new.md`). */
    exists: boolean;
    /** A mark of what was read (a new file has one too), handed back to `writeDocument`. */
    stamp: string;
}

/** What became of a save. */
export type SaveOutcome =
    | { outcome: 'written'; path: string; stamp: string }
    /** Not written: another application changed the file since it was read. */
    | { outcome: 'changedOnDisk' };

export const backend = {
    readDocument: (path: string) => invoke<DocumentFile>('read_document', { path }),
    /**
     * Writes `text`, unless the file no longer holds what `expected` (the
     * stamp it was read or last saved with) marks; without `expected` the
     * file is overwritten.
     */
    writeDocument: (path: string, text: string, expected: string | undefined) =>
        invoke<SaveOutcome>('write_document', { path, text, expected: expected ?? null }),
    initialDocumentPath: () => invoke<string | null>('initial_document_path'),
    /** Shows the open dialog; the chosen file may be read and written whatever its name. */
    chooseDocumentToOpen: () => invoke<string | null>('choose_document_to_open'),
    /** Shows the save dialog, seeded from `current`; the chosen path is granted like an opened one. */
    chooseDocumentToSave: (current: string | undefined) =>
        invoke<string | null>('choose_document_to_save', { current: current ?? null }),
    listSystemFonts: () => invoke<string[]>('list_system_fonts'),
    loadSettings: () => invoke<unknown>('load_settings'),
    saveSettings: (settings: object) => invoke<void>('save_settings', { settings }),
    /** The system's preferred languages as BCP 47 tags, most preferred first. */
    systemLanguages: () => invoke<string[]>('system_languages'),
    /** Whether each word is spelled correctly in one of `languages`, in order. */
    checkWords: (words: string[], languages: readonly SpellingLanguage[]) =>
        invoke<boolean[]>('check_words', { words, languages }),
    spellingSuggestions: (word: string, languages: readonly SpellingLanguage[]) =>
        invoke<string[]>('spelling_suggestions', { word, languages }),
    /** Adds a word to the personal dictionary. */
    addToDictionary: (word: string) => invoke<void>('add_to_dictionary', { word }),
};
