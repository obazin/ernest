<script lang="ts">
    import { onMount } from 'svelte';
    import { listen } from '@tauri-apps/api/event';
    import { getCurrentWindow } from '@tauri-apps/api/window';
    import { message as showMessage } from '@tauri-apps/plugin-dialog';
    import { antiGlareOpacity, applyTypography, focusOverlayOpacity } from './lib/appearance';
    import { backend } from './lib/backend';
    import DarkenOverlay from './lib/design-system/atoms/DarkenOverlay.svelte';
    import SpotlightOverlay from './lib/design-system/atoms/SpotlightOverlay.svelte';
    import SettingsPanel from './lib/features/settings/organisms/SettingsPanel.svelte';
    import StatusLine from './lib/features/status/organisms/StatusLine.svelte';
    import { installVimExtensions } from './lib/editor/vim';
    import { setClipboardSharing } from './lib/editor/vim/clipboard';
    import { applyEscapeSequence } from './lib/editor/vim/escapeSequence';
    import { applyMappings } from './lib/editor/vim/mappings';
    import { installVimCommands } from './lib/editor/vimCommands';
    import { WritingEditor, type EditorOptions } from './lib/editor/writingEditor';
    import { baseName, documentKindForPath, resolvePath } from './lib/documents';
    import {
        clamp,
        defaultSettings,
        limits,
        normalizeSettings,
        type Settings,
    } from './lib/settings';
    import { createSerialQueue } from './lib/serialQueue';
    import { applyPalette, findPalette, palettes } from './lib/themes/palettes';
    import { countWords } from './lib/wordCount';

    /**
     * What to do when an action would throw away unsaved changes: `ask` offers
     * to save them first (menus, shortcuts, window close), `refuse` answers
     * like Vim does without a bang (`E37`), `force` discards (`:q!`, `:e!`).
     */
    type DiscardPolicy = 'ask' | 'refuse' | 'force';

    const appWindow = getCurrentWindow();
    const isMac = navigator.userAgent.includes('Mac');
    /** Control-key chords Vim already means something by, left to Vim off macOS. */
    const vimControlKeys = new Set(['o', 'n']);

    let settings = $state<Settings>({ ...defaultSettings });
    let settingsLoaded = false;
    let settingsOpen = $state(false);

    let host: HTMLElement;
    let editor = $state.raw<WritingEditor>();

    let documentPath = $state<string>();
    /** The stamp of what the file held when the document was read or last written. */
    let diskStamp: string | undefined;
    /** Set when autosave found the file changed on disk; a write or reload clears it. */
    let autosavePaused = false;
    let dirty = $state(false);
    /** Bumped on every edit, so a write that raced with typing does not mark the document clean. */
    let changeGeneration = 0;
    /** Bumped on every load, so a write that finishes after another document was opened leaves it alone. */
    let loadGeneration = 0;
    let closing = false;
    /** Set while the unsaved-changes dialog is showing. */
    let askingToSave = false;

    let words = $state(0);
    let vimMode = $state('');
    let message = $state('');
    let typing = $state(false);
    /** Screen y the focus overlay centres on, reported by the editor. */
    let focusPoint = $state(window.innerHeight / 2);

    const title = $derived(documentPath ? baseName(documentPath) : 'Untitled');

    // ── Appearance ──────────────────────────────────────────────────────────

    $effect(() => applyPalette(findPalette(settings.theme)));

    $effect(() => applyTypography(settings));

    /** The settings the editor applies itself. */
    function editorOptions(): EditorOptions {
        return {
            vim: settings.vim,
            typewriter: settings.typewriter,
            typewriterAnchor: settings.typewriterAnchor,
            typewriterGlide: settings.typewriterGlide,
            focusMode: settings.focusMode,
            spellcheck: settings.spellcheck,
            // Spread, so an effect calling this also tracks the array's elements.
            spellingLanguages: [...settings.spellingLanguages],
            livePreview: settings.livePreview,
        };
    }

    $effect(() => {
        const options = editorOptions();
        editor?.configure(options);
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
    /** Writes run one at a time, each waiting for the one before. */
    const queueWrite = createSerialQueue();
    let wordCountTimer: ReturnType<typeof setTimeout> | undefined;
    let typingTimer: ReturnType<typeof setTimeout> | undefined;

    function handleChange() {
        changeGeneration += 1;
        dirty = true;
        clearTimeout(wordCountTimer);
        wordCountTimer = setTimeout(() => (words = countWords(editor?.text() ?? '')), 250);
        if (settings.autosave && documentPath && !autosavePaused) {
            clearTimeout(autosaveTimer);
            autosaveTimer = setTimeout(() => {
                if (dirty) write(undefined, false, { quiet: true }).catch(report);
            }, 1500);
        }
    }

    // ── Documents ───────────────────────────────────────────────────────────

    async function mayDiscard(policy: DiscardPolicy): Promise<boolean> {
        if (!dirty || policy === 'force') return true;
        if (policy === 'refuse') {
            notify('E37: No write since last change (add ! to override)');
            return false;
        }
        // A second request while the dialog shows (Cmd+Q pressed twice) is
        // turned down rather than stacking another dialog.
        if (askingToSave) return false;
        askingToSave = true;
        try {
            // Save comes first, so Return keeps the work; macOS gives Escape to
            // Cancel and Cmd+D to Don't Save, and closing the dialog cancels
            // on every platform.
            const answer = await showMessage(`Do you want to save the changes to “${title}”?`, {
                title: 'Unsaved changes',
                kind: 'warning',
                buttons: { yes: 'Save', no: "Don't Save", cancel: 'Cancel' },
            });
            if (answer === "Don't Save") return true;
            if (answer !== 'Save') return false;
            try {
                return await write(undefined, false);
            } catch (error) {
                // Shown here: the window close path would otherwise swallow it.
                report(error);
                return false;
            }
        } finally {
            askingToSave = false;
        }
    }

    function loadDocument(text: string, path: string | undefined, stamp?: string) {
        loadGeneration += 1;
        documentPath = path;
        diskStamp = stamp;
        autosavePaused = false;
        editor?.load(text, documentKindForPath(path));
        changeGeneration += 1;
        dirty = false;
        words = countWords(text);
        editor?.focus();
    }

    async function openDocument(path: string | undefined, policy: DiscardPolicy) {
        if (!(await mayDiscard(policy))) return;
        const target = path
            ? await resolvePath(path, documentPath)
            : await backend.chooseDocumentToOpen();
        if (!target) return;
        const file = await backend.readDocument(target);
        loadDocument(file.text, file.path, file.stamp);
        if (!file.exists) notify(`“${baseName(file.path)}” [New]`);
    }

    async function newDocument(policy: DiscardPolicy) {
        if (!(await mayDiscard(policy))) return;
        loadDocument('', undefined);
    }

    /**
     * `path` given while the document already has a name writes a copy and
     * leaves the document as it is (`:w other.md`); `saveAs` renames it
     * (`:sav`, Shift+Mod+S). Saving the document over its own file checks
     * that no other application changed the file since it was read: `force`
     * (`:w!`) overwrites anyway, `quiet` (autosave) stops and says so, and
     * otherwise the writer is asked. Writes run one at a time, so a save and
     * an autosave never both check the stamp the other is about to replace.
     * Resolves to false when nothing was written.
     */
    function write(
        path: string | undefined,
        saveAs: boolean,
        options: { quiet?: boolean; force?: boolean } = {},
    ): Promise<boolean> {
        if (!options.quiet) clearTimeout(autosaveTimer);
        return queueWrite(() => writeNow(path, saveAs, options));
    }

    async function writeNow(
        path: string | undefined,
        saveAs: boolean,
        { quiet = false, force = false },
    ): Promise<boolean> {
        if (!editor || (quiet && autosavePaused)) return false;
        const loaded = loadGeneration;
        const writesCopy = path !== undefined && documentPath !== undefined && !saveAs;
        let target: string | null | undefined = path
            ? await resolvePath(path, documentPath)
            : documentPath;
        if (!target || (saveAs && !path)) {
            target = await backend.chooseDocumentToSave(documentPath);
        }
        if (!target) return false;

        const generation = changeGeneration;
        const previousKind = documentKindForPath(documentPath);
        const text = editor.text();
        const overOwnFile = target === documentPath;
        const expected = overOwnFile && !force ? diskStamp : undefined;
        let saved = await backend.writeDocument(target, text, expected);
        if (saved.outcome === 'changedOnDisk') {
            const name = baseName(target);
            if (quiet) {
                autosavePaused = true;
                const hint = settings.vim ? ':w! overwrites, :e! reloads' : 'save to choose';
                notify(`“${name}” changed on disk; autosave paused. ${hint}`);
                return false;
            }
            // Only the middle button overwrites: Return presses the first,
            // and Escape or closing the dialog answers the last.
            const answer = await showMessage(
                `“${name}” was changed by another application since Ernest read it. Overwrite it with your version?`,
                {
                    title: 'File changed on disk',
                    kind: 'warning',
                    buttons: { yes: "Don't Overwrite", no: 'Overwrite', cancel: 'Cancel' },
                },
            );
            if (answer !== 'Overwrite') return false;
            saved = await backend.writeDocument(target, text, undefined);
        }
        if (saved.outcome !== 'written') return false;
        const written = saved.path;
        // Another document was opened meanwhile: the write happened, but the
        // state below now describes that other document.
        if (loadGeneration !== loaded) return true;
        if (overOwnFile || !writesCopy) {
            diskStamp = saved.stamp;
            autosavePaused = false;
        }
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

            editor = new WritingEditor(host, editorOptions(), {
                onChange: handleChange,
                onVimModeChange: (mode) => (vimMode = mode),
                onFocusPointMove: (y) => (focusPoint = y),
            });
            if (settings.vim) vimMode = 'normal';

            installVimExtensions();
            installVimCommands({
                write: (path, saveAs, force) => write(path, saveAs, { force }),
                // Bare `:e` re-reads the current file (`:e!` reverts it); only an
                // unnamed document falls through to the file picker.
                edit: (path, force) =>
                    openDocument(path ?? documentPath, force ? 'force' : 'refuse'),
                newDocument: (force) => newDocument(force ? 'force' : 'refuse'),
                quit: (force) => quit(force ? 'force' : 'refuse'),
                isModified: () => dirty,
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

<!-- Focus mode: fades the text away from the point being written, under the interface and click-through. -->
{#if settings.focusMode}
    <SpotlightOverlay centre={focusPoint} strength={focusOverlayOpacity} />
{/if}

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

<!-- Anti-glare: drawn over everything, the settings panel included, and click-through.
     Focus mode replaces it while on. -->
{#if !settings.focusMode}
    <DarkenOverlay strength={antiGlareOpacity(settings.antiGlare)} />
{/if}
