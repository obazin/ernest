<script lang="ts">
    interface Props {
        title: string;
        dirty: boolean;
        words: number;
        vimMode: string;
        message: string;
        /** Hidden while the writer is typing; the line returns when they pause. */
        hidden: boolean;
    }

    let { title, dirty, words, vimMode, message, hidden }: Props = $props();

    const wordFormatter = new Intl.NumberFormat();

    /** Colours the Vim mode by its first word (`visual line` → `visual`); normal stays muted. */
    const modeColors: Record<string, string> = {
        insert: 'text-code',
        visual: 'text-emphasis',
        replace: 'text-strong',
    };
</script>

<footer
    class={[
        'pointer-events-none fixed inset-x-0 bottom-0 flex items-center gap-4 px-4.5 pt-2 pb-2.5',
        'text-caption tracking-status text-muted transition-opacity duration-400',
        hidden ? 'opacity-0' : 'opacity-75',
    ]}
>
    <!-- One line whatever the lengths: a message takes the room left and
         truncates, the name gives way past a third of the line while one
         shows, and the unsaved-changes dot always shows. -->
    <span class={['flex min-w-0 gap-1', message ? 'max-w-1/3 shrink-0' : 'shrink']}>
        <span class="truncate">{title}</span>
        {#if dirty}
            <span class="text-accent" aria-hidden="true">•</span>
            <span class="sr-only">unsaved changes</span>
        {/if}
    </span>
    <span class="min-w-0 flex-1 truncate text-foreground" aria-live="polite">{message}</span>
    <span class="flex shrink-0 gap-4 whitespace-nowrap tabular-nums">
        {#if vimMode}
            <span class={['font-semibold tracking-label', modeColors[vimMode.split(' ')[0]]]}>
                {vimMode.toUpperCase()}
            </span>
        {/if}
        <span>{wordFormatter.format(words)} {words === 1 ? 'word' : 'words'}</span>
    </span>
</footer>
