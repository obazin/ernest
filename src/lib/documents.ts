import { dirname, homeDir, isAbsolute, join } from '@tauri-apps/api/path';
import type { DocumentKind } from './editor/writingEditor';

/**
 * Document paths as the page handles them: naming, resolving what the writer
 * typed, and choosing how a file is edited. Reading, writing and the file
 * dialogs go through `backend.ts`, since the backend decides which paths the
 * webview may touch.
 */

/** The file name at the end of `path`, for either separator. */
export function baseName(path: string): string {
    return path.split(/[\\/]/).pop() ?? path;
}

/**
 * Resolves `~/…` and relative paths against the folder of `currentPath`, or
 * the home folder for an unnamed document, as Vim does.
 */
export async function resolvePath(input: string, currentPath: string | undefined): Promise<string> {
    if (input === '~' || input.startsWith('~/')) return join(await homeDir(), input.slice(1));
    if (await isAbsolute(input)) return input;
    const base = currentPath ? await dirname(currentPath) : await homeDir();
    return join(base, input);
}

/** Markdown for an unnamed document or a Markdown extension, plain text otherwise. */
export function documentKindForPath(path: string | undefined): DocumentKind {
    if (!path) return 'markdown';
    return /\.(md|markdown|mdown|mkd|mdx)$/i.test(path) ? 'markdown' : 'plain-text';
}
