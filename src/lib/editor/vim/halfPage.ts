import { EditorSelection } from '@codemirror/state';
import { Vim } from '@replit/codemirror-vim';
import { hasTypewriterScrolling } from '../typewriter';
import { mapCommand, offsetOf, positionAt, viewOf, type MotionFunction } from './engine';

/**
 * `Ctrl+D` / `Ctrl+U`: move half a window down or up, by lines on screen.
 *
 * The stock motion scrolls the window itself, which fights typewriter
 * scrolling. Here the cursor moves; with typewriter scrolling on, the usual
 * centring (and its glide) follows. Without it, the window scrolls by the
 * same distance so the cursor keeps its place on screen, as in Vim.
 */
const moveByHalfPage: MotionFunction = (cm, head, motionArgs) => {
    const view = viewOf(cm);
    // A count sets the number of lines, like Vim's 'scroll' option.
    const distance = motionArgs.repeatIsExplicit
        ? motionArgs.repeat * view.defaultLineHeight
        : view.scrollDOM.clientHeight / 2;
    const forward = Boolean(motionArgs.forward);
    const start = EditorSelection.cursor(offsetOf(cm, head));
    const target = view.moveVertically(start, forward, distance);
    if (!hasTypewriterScrolling(view.state)) {
        view.scrollDOM.scrollTop += forward ? distance : -distance;
    }
    return positionAt(cm, target.head);
};

export function registerHalfPageMotion() {
    Vim.defineMotion('ernestHalfPage', moveByHalfPage);
    for (const context of ['normal', 'visual'] as const) {
        mapCommand(
            '<C-d>',
            'motion',
            'ernestHalfPage',
            { forward: true, explicitRepeat: true },
            { context },
        );
        mapCommand(
            '<C-u>',
            'motion',
            'ernestHalfPage',
            { forward: false, explicitRepeat: true },
            { context },
        );
    }
}
