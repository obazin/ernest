import { registerDisplayLineMotions } from './displayLines';
import { registerHalfPageMotion } from './halfPage';
import { registerHeadingMotion } from './headingMotion';
import { registerOpenLine } from './openLine';
import { registerReflowOperator } from './reflow';

let registered = false;

/**
 * Registers Ernest's additions to the Vim engine: motions, actions and
 * operators tuned for prose. The engine keeps one global keymap, so this runs
 * once, however many editor states are created or hot reloads happen.
 */
export function installVimExtensions() {
    if (registered) return;
    registered = true;
    registerDisplayLineMotions();
    registerHalfPageMotion();
    registerHeadingMotion();
    registerOpenLine();
    registerReflowOperator();
}
