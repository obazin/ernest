<script lang="ts">
    import type { HTMLTextareaAttributes } from 'svelte/elements';

    /** A multi-line input that takes text in the writer's own font. */
    let { value = $bindable(), class: className, ...attributes }: HTMLTextareaAttributes = $props();
</script>

<textarea
    class={[
        'resize-y rounded-control border border-border bg-background px-2 py-1.5 font-editor text-body outline-none focus:border-accent',
        className,
    ]}
    spellcheck="false"
    autocomplete="off"
    {...attributes}
    bind:value></textarea>
