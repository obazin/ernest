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
    aria-live="polite"
>
    <span class="truncate">
        {title}{#if dirty}<span class="text-accent" title="Unsaved changes"> •</span>{/if}
    </span>
    {#if message}
        <span class="text-foreground">{message}</span>
    {/if}
    <span class="ml-auto flex gap-4 tabular-nums">
        {#if vimMode}
            <span class={['font-semibold tracking-label', modeColors[vimMode.split(' ')[0]]]}>
                {vimMode.toUpperCase()}
            </span>
        {/if}
        <span>{wordFormatter.format(words)} {words === 1 ? 'word' : 'words'}</span>
    </span>
</footer>
