<script lang="ts">
    import { onMount } from 'svelte';
    import { backend } from '../backend';
    import { fontFamilyStack, limits, type BooleanSetting, type Settings } from '../settings';
    import { palettes } from '../themes/palettes';

    interface Props {
        settings: Settings;
        onclose: () => void;
    }

    let { settings = $bindable(), onclose }: Props = $props();

    let fonts = $state<string[]>([]);
    let fontsLoading = $state(true);
    let fontQuery = $state('');
    let panel: HTMLElement;

    const filteredFonts = $derived.by(() => {
        const query = fontQuery.trim().toLowerCase();
        return query === '' ? fonts : fonts.filter((name) => name.toLowerCase().includes(query));
    });

    const toggles: {
        key: BooleanSetting;
        label: string;
        hint: string;
    }[] = [
        { key: 'vim', label: 'Vim mode', hint: ':w :q :e :sav :enew :colo' },
        {
            key: 'vimClipboard',
            label: 'Share clipboard with system',
            hint: 'Vim yanks and pastes use the system clipboard',
        },
        { key: 'typewriter', label: 'Typewriter scrolling', hint: 'Keep the current line centred' },
        { key: 'focusMode', label: 'Focus mode', hint: 'Dim every paragraph but this one' },
        {
            key: 'livePreview',
            label: 'Live preview',
            hint: 'Hide Markdown syntax off the current line',
        },
        { key: 'spellcheck', label: 'Spell checking', hint: 'Uses the system dictionary' },
        { key: 'autosave', label: 'Autosave', hint: 'Write named files when you pause' },
    ];

    onMount(() => {
        panel.focus();
        backend
            .listSystemFonts()
            .then((names) => (fonts = names))
            .finally(() => (fontsLoading = false));
    });

    function handleKeydown(event: KeyboardEvent) {
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            onclose();
        }
    }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" onclick={onclose}></div>

<div
    class="panel"
    role="dialog"
    aria-modal="true"
    aria-label="Settings"
    tabindex="-1"
    bind:this={panel}
    onkeydown={handleKeydown}
>
    <header>
        <h2>Settings</h2>
        <button class="close" onclick={onclose} aria-label="Close settings">esc</button>
    </header>

    <section>
        <h3>Theme</h3>
        <div class="themes">
            {#each palettes as palette (palette.identifier)}
                <button
                    class="theme"
                    class:selected={settings.theme === palette.identifier}
                    style:background={palette.colors.background}
                    style:color={palette.colors.foreground}
                    style:border-color={settings.theme === palette.identifier
                        ? palette.colors.accent
                        : palette.colors.border}
                    onclick={() => (settings.theme = palette.identifier)}
                >
                    <span class="swatches" aria-hidden="true">
                        {#each [palette.colors.heading, palette.colors.emphasis, palette.colors.link, palette.colors.code] as color, index (index)}
                            <span style:background={color}></span>
                        {/each}
                    </span>
                    {palette.name}
                </button>
            {/each}
        </div>
    </section>

    <section>
        <h3>Typography</h3>
        <label class="row">
            <span>Size</span>
            <input
                type="range"
                min={limits.fontSize.minimum}
                max={limits.fontSize.maximum}
                step={limits.fontSize.step}
                bind:value={settings.fontSize}
            />
            <output>{settings.fontSize}px</output>
        </label>
        <label class="row">
            <span>Line height</span>
            <input
                type="range"
                min={limits.lineHeight.minimum}
                max={limits.lineHeight.maximum}
                step={limits.lineHeight.step}
                bind:value={settings.lineHeight}
            />
            <output>{settings.lineHeight.toFixed(2)}</output>
        </label>
        <label class="row">
            <span>Column width</span>
            <input
                type="range"
                min={limits.columnWidth.minimum}
                max={limits.columnWidth.maximum}
                step={limits.columnWidth.step}
                bind:value={settings.columnWidth}
            />
            <output>{settings.columnWidth}px</output>
        </label>

        <div class="font-picker">
            <input
                type="search"
                placeholder={fontsLoading
                    ? 'Loading system fonts…'
                    : `Search ${fonts.length} fonts`}
                bind:value={fontQuery}
                spellcheck="false"
            />
            <ul role="listbox" aria-label="Font family">
                <li>
                    <button
                        role="option"
                        aria-selected={settings.fontFamily === ''}
                        class:selected={settings.fontFamily === ''}
                        style:font-family={fontFamilyStack('')}
                        onclick={() => (settings.fontFamily = '')}>Default monospace</button
                    >
                </li>
                {#each filteredFonts as name (name)}
                    <li>
                        <button
                            role="option"
                            aria-selected={settings.fontFamily === name}
                            class:selected={settings.fontFamily === name}
                            style:font-family={fontFamilyStack(name)}
                            onclick={() => (settings.fontFamily = name)}>{name}</button
                        >
                    </li>
                {/each}
            </ul>
        </div>
    </section>

    <section>
        <h3>Writing</h3>
        {#each toggles as toggle (toggle.key)}
            <label class="toggle">
                <input type="checkbox" bind:checked={settings[toggle.key]} />
                <span class="label">{toggle.label}</span>
                <span class="hint">{toggle.hint}</span>
            </label>
        {/each}
    </section>
</div>

<style>
    .backdrop {
        position: fixed;
        inset: 0;
        background: color-mix(in srgb, var(--color-background) 40%, transparent);
    }

    .panel {
        position: fixed;
        top: 0;
        right: 0;
        bottom: 0;
        width: min(420px, 100vw);
        overflow-y: auto;
        padding: 36px 24px 24px;
        background: var(--color-surface);
        color: var(--color-foreground);
        border-left: 1px solid var(--color-border);
        font-size: 13px;
        outline: none;
        animation: slide-in 160ms ease-out;
    }

    @keyframes slide-in {
        from {
            transform: translateX(24px);
            opacity: 0;
        }
    }

    header {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
    }

    h2 {
        margin: 0;
        font-size: 15px;
        font-weight: 600;
    }

    h3 {
        margin: 28px 0 10px;
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--color-muted);
    }

    button {
        cursor: pointer;
    }

    .close {
        border: 1px solid var(--color-border);
        background: none;
        border-radius: 4px;
        padding: 1px 6px;
        font-size: 11px;
        color: var(--color-muted);
    }

    .themes {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
    }

    .theme {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 8px;
        padding: 10px;
        border: 2px solid;
        border-radius: 6px;
        text-align: left;
        font-size: 12px;
    }

    .swatches {
        display: flex;
        gap: 4px;
    }

    .swatches span {
        width: 12px;
        height: 12px;
        border-radius: 50%;
    }

    .row {
        display: grid;
        grid-template-columns: 96px 1fr 56px;
        align-items: center;
        gap: 12px;
        margin-bottom: 8px;
    }

    .row output {
        text-align: right;
        font-variant-numeric: tabular-nums;
        color: var(--color-muted);
    }

    input[type='range'] {
        accent-color: var(--color-accent);
    }

    .font-picker {
        margin-top: 16px;
        border: 1px solid var(--color-border);
        border-radius: 6px;
        overflow: hidden;
    }

    .font-picker input {
        width: 100%;
        padding: 8px 10px;
        border: none;
        border-bottom: 1px solid var(--color-border);
        background: var(--color-background);
        outline: none;
    }

    .font-picker ul {
        list-style: none;
        margin: 0;
        padding: 4px;
        height: 240px;
        overflow-y: auto;
    }

    .font-picker li {
        /* Hundreds of rows, each in its own font: skip laying out the hidden ones. */
        content-visibility: auto;
        contain-intrinsic-size: auto 30px;
    }

    .font-picker button {
        width: 100%;
        padding: 5px 8px;
        border: none;
        border-radius: 4px;
        background: none;
        text-align: left;
        font-size: 15px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .font-picker button:hover {
        background: var(--color-border);
    }

    .font-picker button.selected {
        background: color-mix(in srgb, var(--color-accent) 25%, transparent);
    }

    .toggle {
        display: grid;
        grid-template-columns: auto 1fr;
        column-gap: 10px;
        padding: 6px 0;
        cursor: pointer;
    }

    .toggle input {
        grid-row: span 2;
        accent-color: var(--color-accent);
    }

    .toggle .hint {
        color: var(--color-muted);
        font-size: 12px;
    }
</style>
