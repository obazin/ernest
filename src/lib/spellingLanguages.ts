/**
 * The languages the spell checker has a dictionary for, by the code the
 * backend expects. Mirrors the `Language` enum in `src-tauri/src/spelling.rs`.
 */
export const spellingLanguages = [
    { code: 'en-US', name: 'English (US)' },
    { code: 'fr', name: 'Français' },
    { code: 'it', name: 'Italiano' },
    { code: 'es', name: 'Español' },
] as const;

export type SpellingLanguage = (typeof spellingLanguages)[number]['code'];

/** The language checked when the system names none Ernest has a dictionary for. */
export const fallbackSpellingLanguages: readonly SpellingLanguage[] = ['en-US'];

/**
 * The spelling language for the first system language Ernest has a
 * dictionary for, matched on the language alone (`fr-CA` → `fr`, `en-GB` →
 * `en-US`), or English (US) when there is none.
 */
export function systemSpellingLanguages(systemLanguages: readonly string[]): SpellingLanguage[] {
    for (const tag of systemLanguages) {
        const primary = tag.split(/[-_]/)[0].toLowerCase();
        const match = spellingLanguages.find((language) => language.code.split('-')[0] === primary);
        if (match) return [match.code];
    }
    return [...fallbackSpellingLanguages];
}
