<script lang="ts">
    import type { Snippet } from 'svelte';
    import KeyCapButton from '../atoms/KeyCapButton.svelte';

    interface Props {
        title: string;
        onclose: () => void;
        children: Snippet;
    }

    let { title, onclose, children }: Props = $props();

    function handleKeydown(event: KeyboardEvent) {
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            onclose();
        }
    }
</script>

<!-- A modal panel sliding in from the right edge over a dimmed backdrop; Escape or a click outside closes it. -->

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="fixed inset-0 bg-background/40" onclick={onclose}></div>

<div
    class={[
        'fixed inset-y-0 right-0 w-side-panel max-w-full overflow-y-auto px-6 pt-9 pb-6',
        'border-l border-border bg-surface text-body text-foreground outline-none animate-panel-in',
    ]}
    role="dialog"
    aria-modal="true"
    aria-label={title}
    tabindex="-1"
    {@attach (panel) => panel.focus()}
    onkeydown={handleKeydown}
>
    <header class="flex items-baseline justify-between">
        <h2 class="text-title font-semibold">{title}</h2>
        <KeyCapButton key="esc" label="Close {title.toLowerCase()}" onclick={onclose} />
    </header>
    {@render children()}
</div>
