<script lang="ts">
    import { onMount } from 'svelte';
    import { backend } from '../backend';
    import { parseMappings } from '../editor/vim/mappings';
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

    const mappingErrors = $derived(parseMappings(settings.vimMappings).errors);

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
        { key: 'spellcheck', label: 'Spell checking', hint: 'English (US), plus words you add' },
        { key: 'autosave', label: 'Autosave', hint: 'Write named files when you pause' },
    ];

    const sliders: {
        key: keyof typeof limits;
        label: string;
        format: (value: number) => string;
    }[] = [
        { key: 'fontSize', label: 'Size', format: (value) => `${value}px` },
        { key: 'lineHeight', label: 'Line height', format: (value) => value.toFixed(2) },
        { key: 'columnWidth', label: 'Column width', format: (value) => `${value}px` },
    ];

    onMount(() => {
        panel.focus();
        backend
            .listSystemFonts()
            .then((names) => (fonts = names))
            .finally(() => (fontsLoading = false));
    });

    /** Inputs that take text in the writer's own font. */
    const textInput =
        'rounded-control border border-border bg-background font-editor outline-none focus:border-accent';

    function handleKeydown(event: KeyboardEvent) {
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            onclose();
        }
    }
</script>

{#snippet heading(text: string)}
    <h3 class="mt-7 mb-2.5 text-label font-semibold tracking-label text-muted uppercase">
        {text}
    </h3>
{/snippet}

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="fixed inset-0 bg-background/40" onclick={onclose}></div>

<div
    class={[
        'fixed inset-y-0 right-0 w-settings max-w-full overflow-y-auto px-6 pt-9 pb-6',
        'border-l border-border bg-surface text-body text-foreground outline-none animate-panel-in',
    ]}
    role="dialog"
    aria-modal="true"
    aria-label="Settings"
    tabindex="-1"
    bind:this={panel}
    onkeydown={handleKeydown}
>
    <header class="flex items-baseline justify-between">
        <h2 class="text-title font-semibold">Settings</h2>
        <button
            class="cursor-pointer rounded-control border border-border px-1.5 py-px text-label text-muted"
            onclick={onclose}
            aria-label="Close settings">esc</button
        >
    </header>

    <section>
        {@render heading('Theme')}
        <div class="grid grid-cols-2 gap-2">
            {#each palettes as palette (palette.identifier)}
                <!-- Each card previews its own palette, so its colours are data, not tokens. -->
                <button
                    class="flex cursor-pointer flex-col items-start gap-2 rounded-card border-2 p-2.5 text-left text-caption"
                    style:background={palette.colors.background}
                    style:color={palette.colors.foreground}
                    style:border-color={settings.theme === palette.identifier
                        ? palette.colors.accent
                        : palette.colors.border}
                    onclick={() => (settings.theme = palette.identifier)}
                >
                    <span class="flex gap-1" aria-hidden="true">
                        {#each [palette.colors.heading, palette.colors.emphasis, palette.colors.link, palette.colors.code] as color, index (index)}
                            <span class="size-3 rounded-full" style:background={color}></span>
                        {/each}
                    </span>
                    {palette.name}
                </button>
            {/each}
        </div>
    </section>

    <section>
        {@render heading('Typography')}
        {#each sliders as slider (slider.key)}
            <label class="mb-2 flex items-center gap-3">
                <span class="w-24 shrink-0">{slider.label}</span>
                <input
                    class="min-w-0 flex-1 accent-accent"
                    type="range"
                    min={limits[slider.key].minimum}
                    max={limits[slider.key].maximum}
                    step={limits[slider.key].step}
                    bind:value={settings[slider.key]}
                />
                <output class="w-14 shrink-0 text-right text-muted tabular-nums">
                    {slider.format(settings[slider.key])}
                </output>
            </label>
        {/each}

        <div class="mt-4 overflow-hidden rounded-card border border-border">
            <input
                class="w-full border-b border-border bg-background px-2.5 py-2 outline-none"
                type="search"
                placeholder={fontsLoading
                    ? 'Loading system fonts…'
                    : `Search ${fonts.length} fonts`}
                bind:value={fontQuery}
                spellcheck="false"
            />
            <ul class="h-60 overflow-y-auto p-1" role="listbox" aria-label="Font family">
                {#each ['', ...filteredFonts] as name (name)}
                    <li class="render-lazily">
                        <button
                            class={[
                                'w-full cursor-pointer truncate rounded-control px-2 py-1.25 text-left text-title',
                                settings.fontFamily === name ? 'bg-accent/25' : 'hover:bg-border',
                            ]}
                            role="option"
                            aria-selected={settings.fontFamily === name}
                            style:font-family={fontFamilyStack(name)}
                            onclick={() => (settings.fontFamily = name)}
                            >{name || 'Default monospace'}</button
                        >
                    </li>
                {/each}
            </ul>
        </div>
    </section>

    <section>
        {@render heading('Writing')}
        {#each toggles as toggle (toggle.key)}
            <label class="flex cursor-pointer items-start gap-2.5 py-1.5">
                <input class="accent-accent" type="checkbox" bind:checked={settings[toggle.key]} />
                <span class="flex flex-col">
                    <span>{toggle.label}</span>
                    <span class="text-caption text-muted">{toggle.hint}</span>
                </span>
            </label>
        {/each}
    </section>

    {#if settings.vim}
        <section>
            {@render heading('Vim')}
            <label class="flex flex-wrap items-center gap-x-2.5 py-1.5">
                <span class="flex-1">Leave insert mode with</span>
                <input
                    class={[textInput, 'w-key-sequence px-2 py-1']}
                    type="text"
                    placeholder="e.g. jk"
                    maxlength="3"
                    spellcheck="false"
                    autocomplete="off"
                    bind:value={settings.vimEscapeSequence}
                />
                <span class="basis-full text-caption text-muted"
                    >Two or three keys typed quickly act as Escape</span
                >
            </label>
            <label class="flex flex-col gap-1 py-1.5">
                <span>Mappings</span>
                <span class="text-caption text-muted"
                    >One per line, as in a vimrc: nnoremap Y y$</span
                >
                <textarea
                    class={[textInput, 'resize-y px-2 py-1.5 text-body']}
                    rows="5"
                    placeholder={'" Comments start with a quote\nnnoremap Y y$'}
                    spellcheck="false"
                    autocomplete="off"
                    bind:value={settings.vimMappings}></textarea>
                <!-- The palettes have no error colour; the accent stands out on all of them. -->
                {#each mappingErrors as error (error)}
                    <span class="text-caption text-accent">{error}</span>
                {/each}
            </label>
        </section>
    {/if}
</div>
