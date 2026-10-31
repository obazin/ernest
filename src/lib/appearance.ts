import type { Settings } from './settings';

/**
 * How the settings look on screen: the CSS custom properties the editor
 * theme reads, and the strength of the overlays drawn over the window. The
 * palette is applied separately, by `applyPalette`.
 */

const fallbackFontStack = 'ui-monospace, "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace';

/** The CSS `font-family` value for a chosen family, with a fallback stack behind it. */
export function fontFamilyStack(family: string): string {
    if (family.trim() === '') return fallbackFontStack;
    const quoted = `"${family.replace(/["\\]/g, '\\$&')}"`;
    return `${quoted}, ${fallbackFontStack}`;
}

export type TypographySettings = Pick<
    Settings,
    'fontFamily' | 'fontSize' | 'lineHeight' | 'columnWidth' | 'typewriter' | 'typewriterAnchor'
>;

/** Writes the typography the editor theme reads (`editorTheme.ts`) to the document root. */
export function applyTypography(
    settings: TypographySettings,
    root: HTMLElement = document.documentElement,
) {
    const style = root.style;
    style.setProperty('--font-editor', fontFamilyStack(settings.fontFamily));
    style.setProperty('--editor-font-size', `${settings.fontSize}px`);
    style.setProperty('--editor-line-height', String(settings.lineHeight));
    style.setProperty('--editor-column-width', `${settings.columnWidth}px`);
    // Typewriter mode needs the window height below the anchor under the
    // text, so the last line can reach the anchor.
    style.setProperty(
        '--editor-padding-bottom',
        settings.typewriter ? `calc(${100 - settings.typewriterAnchor}vh - 1em)` : '12vh',
    );
}

/**
 * Overlay opacity for an anti-glare strength: the full slider spans 0–0.7,
 * since past that the window flattens to an unreadable grey.
 */
export function antiGlareOpacity(strength: number): number {
    return (strength / 100) * 0.7;
}

/** Opacity of the focus mode fade where it is thickest. */
export const focusOverlayOpacity = 0.4;
