import type { EditorView } from '@codemirror/view';
import { CodeMirror, Vim } from '@replit/codemirror-vim';

/**
 * Typed access to the parts of the Vim engine the extensions in this folder
 * use. The engine works in CodeMirror 5 terms (`{ line, ch }` positions on a
 * `cm` adapter); the adapter's `cm6` is the real `EditorView`.
 */
export type MotionFunction = Parameters<typeof Vim.defineMotion>[1];
export type ActionFunction = Parameters<typeof Vim.defineAction>[1];
export type OperatorFunction = Parameters<typeof Vim.defineOperator>[1];
export type Adapter = Parameters<MotionFunction>[0];
export type Position = Parameters<MotionFunction>[1];

export type Context = 'normal' | 'visual' | 'insert' | 'operatorPending';

export function viewOf(cm: Adapter): EditorView {
    return (cm as unknown as CodeMirror).cm6;
}

export function offsetOf(cm: Adapter, position: Position): number {
    return (cm as unknown as CodeMirror).indexFromPos(position);
}

export function positionAt(cm: Adapter, offset: number): Position {
    const { line, ch } = (cm as unknown as CodeMirror).posFromIndex(offset);
    return new CodeMirror.Pos(line, ch);
}

/** `Vim.mapCommand` with the command's extra fields spelled out. */
export function mapCommand(
    keys: string,
    type: 'motion' | 'action' | 'operator',
    name: string,
    args: object,
    extra: { context?: Context; [field: string]: unknown },
) {
    Vim.mapCommand(keys, type, name, args, extra);
}
