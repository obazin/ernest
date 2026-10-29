<script lang="ts">
    import type { Snippet } from 'svelte';

    interface Props {
        pressed: boolean;
        /** Pressing it changes nothing at the moment, so it shows no pointer. */
        locked?: boolean;
        title?: string;
        onclick: () => void;
        children: Snippet;
    }

    let { pressed, locked = false, title, onclick, children }: Props = $props();
</script>

<button
    class={[
        'rounded-control border px-2 py-0.5 text-caption',
        locked ? 'cursor-default' : 'cursor-pointer',
        pressed
            ? 'border-accent bg-accent/25 text-foreground'
            : 'border-border text-muted hover:bg-border',
    ]}
    aria-pressed={pressed}
    {title}
    {onclick}>{@render children()}</button
>
