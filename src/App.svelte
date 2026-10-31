<script lang="ts">
    import { onMount } from 'svelte';
    import { listen } from '@tauri-apps/api/event';
    import { homeDir, isAbsolute, join, dirname } from '@tauri-apps/api/path';
    import { getCurrentWindow } from '@tauri-apps/api/window';
    import { ask, open, save } from '@tauri-apps/plugin-dialog';
    import { backend } from './lib/backend';
    import DarkenOverlay from './lib/design-system/atoms/DarkenOverlay.svelte';
    import SettingsPanel from './lib/features/settings/organisms/SettingsPanel.svelte';
    import StatusLine from './lib/features/status/organisms/StatusLine.svelte';
    import { installVimExtensions } from './lib/editor/vim';
    import { setClipboardSharing } from './lib/editor/vim/clipboard';
    import { applyEscapeSequence } from './lib/editor/vim/escapeSequence';
    import { applyMappings } from './lib/editor/vim/mappings';
    import { installVimCommands } from './lib/editor/vimCommands';
    import { documentKindForPath, WritingEditor } from './lib/editor/writingEditor';
    import {
        antiGlareOpacity,
        clamp,
        defaultSettings,
        fontFamilyStack,
        limits,
        normalizeSettings,
        type Settings,
    } from './lib/settings';
    import { applyPalette, findPalette, palettes } from './lib/themes/palettes';
    import { countWords } from './lib/wordCount';

    /**
     * What to do when an action would throw away unsaved changes: `ask` shows
     * a dialog (menus, shortcuts, window close), `refuse` answers like Vim
     * does without a bang (`E37`), `force` discards (`:q!`, `:e!`).
     */
    type DiscardPolicy = 'ask' | 'refuse' | 'force';

    const appWindow = getCurrentWindow();
    const isMac = navigator.userAgent.includes('Mac');
    /** Control-key chords Vim already means something by, left to Vim off macOS. */
    const vimControlKeys = new Set(['o', 'n']);
    const textFileFilters = [
        { name: 'Text', extensions: ['md', 'markdown', 'txt', 'text'] },
        { name: 'All files', extensions: ['*'] },
    ];

    let settings = $state<Settings>({ ...defaultSettings });
    let settingsLoaded = false;
    let settingsOpen = $state(false);

    let host: HTMLElement;
    let editor = $state.raw<WritingEditor>();

    let documentPath = $state<string>();
    let dirty = $state(false);
    /** Bumped on every edit, so a write that raced with typing does not mark the document clean. */
    let changeGeneration = 0;
    let closing = false;

    let words = $state(0);
    let vimMode = $state('');
    let message = $state('');
    let typing = $state(false);

    const title = $derived(documentPath ? baseName(documentPath) : 'Untitled');

    // ── Appearance ──────────────────────────────────────────────────────────

    $effect(() => applyPalette(findPalette(settings.theme)));

    $effect(() => {
        const root = document.documentElement.style;
        root.setProperty('--font-editor', fontFamilyStack(settings.fontFamily));
        root.setProperty('--editor-font-size', `${settings.fontSize}px`);
        root.setProperty('--editor-line-height', String(settings.lineHeight));
        root.setProperty('--editor-column-width', `${settings.columnWidth}px`);
        // Typewriter mode needs the window height below the anchor under the
        // text, so the last line can reach the anchor.
        root.setProperty(
            '--editor-padding-bottom',
            settings.typewriter ? `calc(${100 - settings.typewriterAnchor}vh - 1em)` : '12vh',
        );
    });

    $effect(() => {
        editor?.configure({
            vim: settings.vim,
            typewriter: settings.typewriter,
            typewriterAnchor: settings.typewriterAnchor,
            typewriterGlide: settings.typewriterGlide,
            focusMode: settings.focusMode,
            spellcheck: settings.spellcheck,
            // Spread, so the effect also tracks the array's elements.
            spellingLanguages: [...settings.spellingLanguages],
            livePreview: settings.livePreview,
        });
    });

    $effect(() => setClipboardSharing(settings.vimClipboard));
    $effect(() => applyEscapeSequence(settings.vimEscapeSequence));
    $effect(() => applyMappings(settings.vimMappings));

    $effect(() => {
        appWindow.setTitle(`${dirty ? '• ' : ''}${title} — Ernest`);
    });

    // ── Persistence ─────────────────────────────────────────────────────────

    let settingsSaveTimer: ReturnType<typeof setTimeout> | undefined;
    $effect(() => {
        const snapshot = $state.snapshot(settings);
        if (!settingsLoaded) return;
        clearTimeout(settingsSaveTimer);
        settingsSaveTimer = setTimeout(() => {
            backend.saveSettings(snapshot).catch((error) => notify(`settings: ${error}`));
        }, 400);
    });

    let autosaveTimer: ReturnType<typeof setTimeout> | undefined;
    let wordCountTimer: ReturnType<typeof setTimeout> | undefined;
    let typingTimer: ReturnType<typeof setTimeout> | undefined;

    function handleChange() {
        changeGeneration += 1;
        dirty = true;
        clearTimeout(wordCountTimer);
        wordCountTimer = setTimeout(() => (words = countWords(editor?.text() ?? '')), 250);
        if (settings.autosave && documentPath) {
            clearTimeout(autosaveTimer);
            autosaveTimer = setTimeout(() => {
                if (dirty) write(undefined, false, { quiet: true });
            }, 1500);
        }
    }

    // ── Documents ───────────────────────────────────────────────────────────

    function baseName(path: string): string {
        return path.split(/[\\/]/).pop() ?? path;
    }

    /** Resolves `~/…` and relative paths against the current document's folder, as Vim does. */
    async function resolvePath(input: string): Promise<string> {
        if (input === '~' || input.startsWith('~/')) return join(await homeDir(), input.slice(1));
        if (await isAbsolute(input)) return input;
        const base = documentPath ? await dirname(documentPath) : await homeDir();
        return join(base, input);
    }

    async function mayDiscard(policy: DiscardPolicy): Promise<boolean> {
        if (!dirty || policy === 'force') return true;
        if (policy === 'refuse') {
            notify('E37: No write since last change (add ! to override)');
            return false;
        }
        return ask(`“${title}” has unsaved changes. Discard them?`, {
            title: 'Unsaved changes',
            kind: 'warning',
            okLabel: 'Discard',
            cancelLabel: 'Keep editing',
        });
    }

    function loadDocument(text: string, path: string | undefined) {
        documentPath = path;
        editor?.load(text, documentKindForPath(path));
        changeGeneration += 1;
        dirty = false;
        words = countWords(text);
        editor?.focus();
    }

    async function openDocument(path: string | undefined, policy: DiscardPolicy) {
        if (!(await mayDiscard(policy))) return;
        const target = path
            ? await resolvePath(path)
            : await open({ multiple: false, directory: false, filters: textFileFilters });
        if (!target) return;
        const file = await backend.readDocument(target);
        loadDocument(file.text, file.path);
        if (!file.exists) notify(`“${baseName(file.path)}” [New]`);
    }

    async function newDocument(policy: DiscardPolicy) {
        if (!(await mayDiscard(policy))) return;
        loadDocument('', undefined);
    }

    /**
     * `path` given while the document already has a name writes a copy and
     * leaves the document as it is (`:w other.md`); `saveAs` renames it
     * (`:sav`, Shift+Mod+S). Resolves to false when nothing was written.
     */
    async function write(
        path: string | undefined,
        saveAs: boolean,
        { quiet = false } = {},
    ): Promise<boolean> {
        if (!editor) return false;
        const writesCopy = path !== undefined && documentPath !== undefined && !saveAs;
        let target: string | null | undefined = path ? await resolvePath(path) : documentPath;
        if (!target || (saveAs && !path)) {
            target = await save({
                defaultPath: documentPath ?? 'Untitled.md',
                filters: textFileFilters,
            });
        }
        if (!target) return false;

        const generation = changeGeneration;
        const previousKind = documentKindForPath(documentPath);
        const written = await backend.writeDocument(target, editor.text());
        if (!writesCopy) {
            documentPath = written;
            dirty = changeGeneration !== generation;
            const kind = documentKindForPath(written);
            if (kind !== previousKind) editor.setKind(kind);
        }
        if (!quiet) notify(`“${baseName(written)}” written`);
        return true;
    }

    async function quit(policy: DiscardPolicy) {
        if (!(await mayDiscard(policy))) return;
        closing = true;
        await appWindow.destroy();
    }

    // ── Feedback ────────────────────────────────────────────────────────────

    let messageTimer: ReturnType<typeof setTimeout> | undefined;
    function notify(text: string) {
        message = text;
        typing = false;
        clearTimeout(messageTimer);
        messageTimer = setTimeout(() => (message = ''), 4000);
    }

    function report(error: unknown) {
        notify(error instanceof Error ? error.message : String(error));
    }

    // ── Keyboard ────────────────────────────────────────────────────────────

    function handleKeydown(event: KeyboardEvent) {
        const fullscreenChord =
            event.key === 'F11' ||
            (isMac && event.metaKey && event.ctrlKey && event.key.toLowerCase() === 'f');
        if (fullscreenChord) {
            event.preventDefault();
            appWindow.isFullscreen().then((fullscreen) => appWindow.setFullscreen(!fullscreen));
            return;
        }

        const modifier = isMac ? event.metaKey : event.ctrlKey;
        if (!modifier || event.altKey) {
            if (!event.metaKey && !event.ctrlKey && event.key.length === 1) markTyping();
            return;
        }
        const key = event.key.toLowerCase();
        if (!isMac && settings.vim && !event.shiftKey && vimControlKeys.has(key)) return;

        const step = (setting: 'fontSize', direction: number) =>
            (settings[setting] = clamp(
                settings[setting] + direction * limits[setting].step,
                limits[setting].minimum,
                limits[setting].maximum,
            ));

        const actions: Record<string, (() => unknown) | undefined> = {
            s: () => write(undefined, event.shiftKey),
            o: () => openDocument(undefined, 'ask'),
            n: () => newDocument('ask'),
            ',': () => (settingsOpen = !settingsOpen),
            '=': () => step('fontSize', 1),
            '+': () => step('fontSize', 1),
            '-': () => step('fontSize', -1),
            '0': () => (settings.fontSize = defaultSettings.fontSize),
            t: event.shiftKey ? () => (settings.typewriter = !settings.typewriter) : undefined,
            d: event.shiftKey ? () => (settings.focusMode = !settings.focusMode) : undefined,
            p: event.shiftKey ? () => (settings.livePreview = !settings.livePreview) : undefined,
        };
        const action = actions[key];
        if (!action) return;
        event.preventDefault();
        event.stopPropagation();
        Promise.resolve(action()).catch(report);
    }

    function markTyping() {
        typing = true;
        clearTimeout(typingTimer);
        typingTimer = setTimeout(() => (typing = false), 1500);
    }

    // ── Startup ─────────────────────────────────────────────────────────────

    onMount(() => {
        const cleanups: (() => void)[] = [];

        (async () => {
            const [stored, systemLanguages] = await Promise.all([
                backend.loadSettings().catch(() => null),
                backend.systemLanguages().catch(() => []),
            ]);
            settings = normalizeSettings(stored, systemLanguages);
            settingsLoaded = true;

            editor = new WritingEditor(
                host,
                {
                    vim: settings.vim,
                    typewriter: settings.typewriter,
                    typewriterAnchor: settings.typewriterAnchor,
                    typewriterGlide: settings.typewriterGlide,
                    focusMode: settings.focusMode,
                    spellcheck: settings.spellcheck,
                    spellingLanguages: [...settings.spellingLanguages],
                    livePreview: settings.livePreview,
                },
                { onChange: handleChange, onVimModeChange: (mode) => (vimMode = mode) },
            );
            if (settings.vim) vimMode = 'normal';

            installVimExtensions();
            installVimCommands({
                write: (path, saveAs) => write(path, saveAs),
                // Bare `:e` re-reads the current file (`:e!` reverts it); only an
                // unnamed document falls through to the file picker.
                edit: (path, force) =>
                    openDocument(path ?? documentPath, force ? 'force' : 'refuse'),
                newDocument: (force) => newDocument(force ? 'force' : 'refuse'),
                quit: (force) => quit(force ? 'force' : 'refuse'),
                colorscheme: (name) => {
                    if (!name) return notify(`colorscheme ${settings.theme}`);
                    const palette = palettes.find((candidate) => candidate.identifier === name);
                    if (!palette) return notify(`E185: Cannot find color scheme '${name}'`);
                    settings.theme = palette.identifier;
                },
                notify,
            });

            cleanups.push(
                await appWindow.onCloseRequested(async (event) => {
                    if (closing) return;
                    if (!(await mayDiscard('ask'))) event.preventDefault();
                }),
                await listen('quit-requested', () => quit('ask').catch(report)),
            );

            const initialPath = await backend.initialDocumentPath();
            if (initialPath) await openDocument(initialPath, 'force').catch(report);

            // The window starts hidden so it never flashes unthemed.
            await appWindow.show();
            await appWindow.setFocus();
            editor.focus();
        })().catch(report);

        return () => {
            cleanups.forEach((cleanup) => cleanup());
            editor?.destroy();
        };
    });
</script>

<svelte:window onkeydowncapture={handleKeydown} onmousemove={() => (typing = false)} />

{#if isMac}
    <!-- The title bar is an overlay on macOS: this strip keeps the window draggable. -->
    <div class="fixed inset-x-0 top-0 z-10 h-7" data-tauri-drag-region></div>
{/if}

<main class="h-full" bind:this={host}></main>

<StatusLine {title} {dirty} {words} {vimMode} {message} hidden={typing && !message} />

{#if settingsOpen}
    <SettingsPanel
        bind:settings
        onclose={() => {
            settingsOpen = false;
            editor?.focus();
        }}
    />
{/if}

<!-- Anti-glare: drawn over everything, the settings panel included, and click-through. -->
<DarkenOverlay strength={antiGlareOpacity(settings.antiGlare)} />
