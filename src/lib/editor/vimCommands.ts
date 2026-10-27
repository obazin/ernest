import { Vim } from '@replit/codemirror-vim';

/**
 * What the Vim ex commands do in the application. Ex commands are registered
 * globally by the Vim engine, once; they call through to whichever handlers
 * the application installed last.
 */
export interface VimCommandHandlers {
    /** `:w [path]`, `:sav path`. Resolves to false if the write did not happen. */
    write(path: string | undefined, saveAs: boolean): Promise<boolean>;
    /** `:e [path]`, `:e!` — no path re-reads the current file. */
    edit(path: string | undefined, force: boolean): Promise<void>;
    /** `:enew` */
    newDocument(force: boolean): Promise<void>;
    /** `:q`, `:q!` */
    quit(force: boolean): Promise<void>;
    /** `:colo name` — no name lists the available schemes. */
    colorscheme(name: string | undefined): void;
    /** Shows a one-line message in the Vim prompt area. */
    notify(message: string): void;
}

let handlers: VimCommandHandlers | undefined;
let registered = false;

/** Splits `!` off the front of an ex argument string: `"! notes.md"` → force, `notes.md`. */
export function parseExArguments(argString: string | undefined): {
    force: boolean;
    argument: string | undefined;
} {
    const raw = argString ?? '';
    const force = raw.startsWith('!');
    const argument = (force ? raw.slice(1) : raw).trim();
    return { force, argument: argument === '' ? undefined : argument };
}

export function installVimCommands(next: VimCommandHandlers) {
    handlers = next;
    if (registered) return;
    registered = true;

    const run = (action: (current: VimCommandHandlers) => unknown) => {
        if (!handlers) return;
        Promise.resolve(action(handlers)).catch((error: unknown) =>
            handlers?.notify(error instanceof Error ? error.message : String(error)),
        );
    };

    Vim.defineEx('write', 'w', (_, parameters) => {
        const { argument } = parseExArguments(parameters.argString);
        run((current) => current.write(argument, false));
    });
    Vim.defineEx('saveas', 'sav', (_, parameters) => {
        const { argument } = parseExArguments(parameters.argString);
        run((current) => current.write(argument, true));
    });
    Vim.defineEx('wq', 'wq', (_, parameters) => {
        const { argument } = parseExArguments(parameters.argString);
        run(async (current) => {
            if (await current.write(argument, false)) await current.quit(true);
        });
    });
    // `:x` only writes when there is something to write; the write handler
    // already skips clean documents, so it behaves like `:wq` here.
    Vim.defineEx('xit', 'x', (_, parameters) => {
        const { argument } = parseExArguments(parameters.argString);
        run(async (current) => {
            if (await current.write(argument, false)) await current.quit(true);
        });
    });
    Vim.defineEx('quit', 'q', (_, parameters) => {
        const { force } = parseExArguments(parameters.argString);
        run((current) => current.quit(force));
    });
    Vim.defineEx('edit', 'e', (_, parameters) => {
        const { force, argument } = parseExArguments(parameters.argString);
        run((current) => current.edit(argument, force));
    });
    Vim.defineEx('enew', 'ene', (_, parameters) => {
        const { force } = parseExArguments(parameters.argString);
        run((current) => current.newDocument(force));
    });
    Vim.defineEx('colorscheme', 'colo', (_, parameters) => {
        const { argument } = parseExArguments(parameters.argString);
        run((current) => current.colorscheme(argument));
    });
}
