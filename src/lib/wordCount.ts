/**
 * Words as a writer counts them: runs of letters or digits, with inner
 * apostrophes and hyphens kept inside the word (`don't`, `well-known`).
 * Markdown syntax (`#`, `*`, `>`, `-` bullets) is punctuation and never counts.
 */
const word = /[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu;

export function countWords(text: string): number {
    let count = 0;
    for (const _ of text.matchAll(word)) count += 1;
    return count;
}
