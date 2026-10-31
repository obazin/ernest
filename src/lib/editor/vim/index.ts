import { registerClipboard } from './clipboard';
import { registerDisplayLineMotions } from './displayLines';
import { registerFolding } from './folding';
import { registerHalfPageMotion } from './halfPage';
import { registerHeadingMotion } from './headingMotion';
import { registerLineFeedReads } from './lineFeedReads';
import { registerMoveLines } from './moveLines';
import { registerOpenLine } from './openLine';
import { registerReflowOperator } from './reflow';
import { registerSpellingKeys } from './spellingKeys';

let registered = false;

/**
 * Registers Ernest's additions to the Vim engine: motions, actions and
 * operators tuned for prose. The engine keeps one global keymap, so this runs
 * once, however many editor states are created or hot reloads happen.
 */
export function installVimExtensions() {
    if (registered) return;
    registered = true;
    registerLineFeedReads();
    registerDisplayLineMotions();
    registerHalfPageMotion();
    registerHeadingMotion();
    registerOpenLine();
    registerReflowOperator();
    registerMoveLines();
    registerClipboard();
    registerFolding();
    registerSpellingKeys();
}
