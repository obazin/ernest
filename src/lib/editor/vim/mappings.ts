import { Vim } from '@replit/codemirror-vim';
import type { Context } from './engine';

/**
 * Vim mappings written in Settings, vimrc style, one per line:
 *
 *     " Yank to the end of the line, like D and C
 *     nnoremap Y y$
 *     imap jj <Esc>
 *
 * They are applied at startup and whenever the text changes. `:map` and
 * `:unmap` typed in the editor still work but last until Ernest quits, as in
 * Vim. `unmap` is not accepted here: the engine cannot restore a mapping it
 * removed, so editing the text could not undo it.
 */

export interface Mapping {
    /** 1-based line in the text, for error messages. */
    line: number;
    lhs: string;
    rhs: string;
    /** `undefined` maps in normal, visual and operator-pending mode. */
    context: Context | undefined;
    noremap: boolean;
}

const contexts: Record<string, Context | undefined> = {
    '': undefined,
    n: 'normal',
    v: 'visual',
    x: 'visual',
    i: 'insert',
    o: 'operatorPending',
};

const command = /^([nvxio]?)(nore)?map$/;

export function parseMappings(text: string): { mappings: Mapping[]; errors: string[] } {
    const mappings: Mapping[] = [];
    const errors: string[] = [];
    text.split('\n').forEach((raw, index) => {
        const line = index + 1;
        const source = raw.trim();
        if (source === '' || source.startsWith('"')) return;
        const [name, lhs, ...rest] = source.split(/\s+/);
        const match = command.exec(name);
        if (!match) {
            errors.push(`Line ${line}: '${name}' is not a mapping command (nmap, inoremap, …)`);
            return;
        }
        if (!lhs || rest.length === 0) {
            errors.push(`Line ${line}: '${name}' needs keys and what they map to`);
            return;
        }
        const context = contexts[match[1]];
        // `:name` maps an ex command, which the engine only accepts without a mode.
        if (context && lhs.length > 1 && lhs.startsWith(':')) {
            errors.push(`Line ${line}: ex commands are mapped with 'map', not '${name}'`);
            return;
        }
        mappings.push({
            line,
            lhs,
            rhs: rest.join(' '),
            context,
            noremap: Boolean(match[2]),
        });
    });
    return { mappings, errors };
}

let applied: Mapping[] = [];

/** Replaces the mappings applied last time with the valid ones in `text`. */
export function applyMappings(text: string) {
    // Each mapping goes to the front of the engine's keymap, so the last one
    // applied is the first one `unmap` finds for the same keys.
    for (const mapping of [...applied].reverse()) {
        Vim.unmap(mapping.lhs, mapping.context as string);
    }
    applied = parseMappings(text).mappings;
    for (const { lhs, rhs, context, noremap } of applied) {
        if (noremap) Vim.noremap(lhs, rhs, context as string);
        else Vim.map(lhs, rhs, context as string);
    }
}
