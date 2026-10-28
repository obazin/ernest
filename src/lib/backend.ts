import { invoke } from '@tauri-apps/api/core';

/** Typed wrappers over the Rust commands in `src-tauri/src`. */

export interface DocumentFile {
    path: string;
    text: string;
    /** False for a path that does not exist yet (`:e new.md`). */
    exists: boolean;
}

export const backend = {
    readDocument: (path: string) => invoke<DocumentFile>('read_document', { path }),
    /** Resolves to the absolute path written. */
    writeDocument: (path: string, text: string) => invoke<string>('write_document', { path, text }),
    initialDocumentPath: () => invoke<string | null>('initial_document_path'),
    listSystemFonts: () => invoke<string[]>('list_system_fonts'),
    loadSettings: () => invoke<unknown>('load_settings'),
    saveSettings: (settings: object) => invoke<void>('save_settings', { settings }),
    /** Whether each word is spelled correctly, in order. */
    checkWords: (words: string[]) => invoke<boolean[]>('check_words', { words }),
    spellingSuggestions: (word: string) => invoke<string[]>('spelling_suggestions', { word }),
    /** Adds a word to the personal dictionary. */
    addToDictionary: (word: string) => invoke<void>('add_to_dictionary', { word }),
};
