<script lang="ts">
    import { fontFamilyStack } from '../../../settings';

    interface Props {
        /** The installed font families, each previewed in itself. */
        fonts: string[];
        loading: boolean;
        /** The chosen family; empty for the default monospace stack. */
        value: string;
    }

    let { fonts, loading, value = $bindable() }: Props = $props();

    let query = $state('');

    const filteredFonts = $derived.by(() => {
        const needle = query.trim().toLowerCase();
        return needle === '' ? fonts : fonts.filter((name) => name.toLowerCase().includes(needle));
    });
</script>

<div class="overflow-hidden rounded-card border border-border">
    <input
        class="w-full border-b border-border bg-background px-2.5 py-2 outline-none"
        type="search"
        placeholder={loading ? 'Loading system fonts…' : `Search ${fonts.length} fonts`}
        bind:value={query}
        spellcheck="false"
    />
    <ul class="h-60 overflow-y-auto p-1" role="listbox" aria-label="Font family">
        {#each ['', ...filteredFonts] as name (name)}
            <li class="render-lazily">
                <button
                    class={[
                        'w-full cursor-pointer truncate rounded-control px-2 py-1.25 text-left text-title',
                        value === name ? 'bg-accent/25' : 'hover:bg-border',
                    ]}
                    role="option"
                    aria-selected={value === name}
                    style:font-family={fontFamilyStack(name)}
                    onclick={() => (value = name)}>{name || 'Default monospace'}</button
                >
            </li>
        {/each}
    </ul>
</div>
