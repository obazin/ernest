<script lang="ts">
    import type { Snippet } from 'svelte';

    interface Props {
        children: Snippet;
    }

    let { children }: Props = $props();
</script>

<h3 class="mt-7 mb-2.5 text-label font-semibold tracking-label text-muted uppercase">
    {@render children()}
</h3>
