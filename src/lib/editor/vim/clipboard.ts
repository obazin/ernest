import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager';
import { Vim } from '@replit/codemirror-vim';
import { withLineFeeds } from '../lineBreaks';
import { mapCommand, type ActionFunction } from './engine';
import { onRegisterWrite } from './registers';

/**
 * The system clipboard in Vim mode, through Tauri's clipboard plugin (the
 * webview's own clipboard API cannot read reliably on Linux).
 *
 * - The `+` register always reads and writes the system clipboard.
 * - With sharing on (Settings → Share clipboard with system, like Vim's
 *   `clipboard=unnamedplus`), the unnamed register does too: yanks, deletes
 *   and changes copy to the clipboard, and `p` pastes what is on it, so text
 *   moves freely between Ernest and other applications.
 */

let sharing = true;

export function setClipboardSharing(enabled: boolean) {
    sharing = enabled;
}

/** Whether a register name (as the engine passes it) is backed by the system clipboard. */
export function usesSystemClipboard(registerName: string | undefined, shared: boolean): boolean {
    if (registerName === '+') return true;
    return shared && (registerName === undefined || registerName === '"');
}

/** A clipboard text replacing the register's: one ending in a line break pastes as lines. */
export function isLinewise(text: string): boolean {
    return text.endsWith('\n');
}

interface Register {
    toString(): string;
    setText(text: string, linewise?: boolean): void;
}

function register(name: string | undefined): Register {
    const controller = Vim.getRegisterController() as unknown as {
        getRegister(name: string | undefined): Register;
    };
    return controller.getRegister(name);
}

const paste: ActionFunction = function (this: Record<string, ActionFunction>, cm, actionArgs, vim) {
    const name = actionArgs.registerName;
    if (!usesSystemClipboard(name, sharing)) return this.paste(cm, actionArgs, vim);

    // The engine's own `continuePaste` does the pasting once the text is in.
    const continuePaste = (this as unknown as Record<string, (...values: unknown[]) => void>)
        .continuePaste;
    const target = register(name);
    readText()
        .catch(() => null)
        .then((copied) => {
            // Registers keep `\n` line breaks, whatever the copying application used.
            const text = copied && withLineFeeds(copied);
            // Text Ernest yanked itself comes back unchanged; keep its register,
            // which remembers whether it was yanked as whole lines.
            if (text && text !== target.toString()) target.setText(text, isLinewise(text));
            continuePaste.call(this, cm, actionArgs, vim, target.toString(), target);
        });
};

export function registerClipboard() {
    onRegisterWrite(({ registerName, text }) => {
        if (!usesSystemClipboard(registerName, sharing)) return;
        writeText(text).catch(() => {
            // The register still holds the text; only the system copy failed.
        });
    });

    Vim.defineAction('ernestPaste', paste);
    const pastes = [
        ['p', { after: true, isEdit: true }],
        ['P', { after: false, isEdit: true }],
        [']p', { after: true, isEdit: true, matchIndent: true }],
        ['[p', { after: false, isEdit: true, matchIndent: true }],
    ] as const;
    for (const [keys, args] of pastes) {
        mapCommand(keys, 'action', 'ernestPaste', args, { isEdit: true });
    }
}
