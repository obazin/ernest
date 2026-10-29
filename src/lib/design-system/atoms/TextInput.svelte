<script lang="ts">
    import type { HTMLInputAttributes } from 'svelte/elements';

    /** A single-line input that takes text in the writer's own font. */
    let { value = $bindable(), class: className, ...attributes }: HTMLInputAttributes = $props();
</script>

<input
    class={[
        'rounded-control border border-border bg-background px-2 py-1 font-editor outline-none focus:border-accent',
        className,
    ]}
    type="text"
    spellcheck="false"
    autocomplete="off"
    {...attributes}
    bind:value
/>
