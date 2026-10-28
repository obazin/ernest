import { Vim } from '@replit/codemirror-vim';

/** What the engine writes into a register on a yank, delete or change. */
export interface RegisterWrite {
    /** `undefined` for the unnamed register. */
    registerName: string | undefined;
    /** `yank`, `delete`, `change`, … */
    operator: string;
    text: string;
    linewise: boolean;
}

type Listener = (write: RegisterWrite) => void;

const listeners: Listener[] = [];
let wrapped = false;

/**
 * Calls `listener` after every register write. The engine funnels every yank,
 * delete and change through its register controller's `pushText`, created
 * once at load, so wrapping that one method sees them all.
 */
export function onRegisterWrite(listener: Listener) {
    listeners.push(listener);
    if (wrapped) return;
    wrapped = true;
    const controller = Vim.getRegisterController() as unknown as {
        pushText(
            registerName: string | undefined,
            operator: string,
            text: string,
            linewise?: boolean,
            blockwise?: boolean,
        ): void;
    };
    const pushText = controller.pushText.bind(controller);
    controller.pushText = (registerName, operator, text, linewise, blockwise) => {
        pushText(registerName, operator, text, linewise, blockwise);
        for (const notify of listeners) {
            notify({ registerName, operator, text, linewise: Boolean(linewise) });
        }
    };
}
