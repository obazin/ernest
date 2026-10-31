/**
 * Words as a writer counts them: runs of letters or digits, with inner
 * apostrophes and hyphens kept inside the word (`don't`, `well-known`), and
 * numbers kept whole across their separators (`3.14`, `10,000`, `9:30`).
 * Markdown syntax (`#`, `*`, `>`, `-` bullets) is punctuation and never
 * counts; a link or image counts its text but not its destination, and a
 * bare URL counts as one word.
 */
const word = /[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+|(?<=\p{N})[.,:]\p{N}+)*/gu;

/**
 * The `(destination "title")` after a link or image's `]`: one token, which
 * may hold one level of parentheses (`Ernest_(disambiguation)`) or be written
 * `<…>`, then an optional quoted title. Kept to a single line and token, so a
 * stray `](` in prose neither swallows the words after it nor rescans the
 * rest of the document.
 */
const linkDestination =
    /\]\((?:<[^<>\n]*>|[^()\s]*(?:\([^()\s]*\)[^()\s]*)*)(?:\s+(?:"[^"\n]*"|'[^'\n]*'))?\s*\)/g;

/** A bare URL: one word however it is spelt. */
const url = /(?:\b(?:https?|ftp|mailto):|\bwww\.)\S+/gi;

export function countWords(text: string): number {
    let prose = text;
    if (prose.includes('](')) prose = prose.replace(linkDestination, ']');
    if (prose.includes(':') || prose.includes('www.')) prose = prose.replace(url, 'link');
    let count = 0;
    for (const _ of prose.matchAll(word)) count += 1;
    return count;
}
