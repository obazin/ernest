<script lang="ts">
    import ColorDot from '../../../design-system/atoms/ColorDot.svelte';
    import type { Palette } from '../../../themes/palettes';

    interface Props {
        palette: Palette;
        selected: boolean;
        onclick: () => void;
    }

    let { palette, selected, onclick }: Props = $props();

    const previewColors = $derived([
        palette.colors.heading,
        palette.colors.emphasis,
        palette.colors.link,
        palette.colors.code,
    ]);
</script>

<!-- The card previews its own palette, so its colours are data, not tokens. -->
<button
    class="flex cursor-pointer flex-col items-start gap-2 rounded-card border-2 p-2.5 text-left text-caption"
    style:background={palette.colors.background}
    style:color={palette.colors.foreground}
    style:border-color={selected ? palette.colors.accent : palette.colors.border}
    aria-pressed={selected}
    {onclick}
>
    <span class="flex gap-1" aria-hidden="true">
        {#each previewColors as color, index (index)}
            <ColorDot {color} />
        {/each}
    </span>
    {palette.name}
</button>
