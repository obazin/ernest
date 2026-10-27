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
</script>

<footer class:hidden aria-live="polite">
    <span class="title">
        {title}{#if dirty}<span class="dirty" title="Unsaved changes"> •</span>{/if}
    </span>
    {#if message}
        <span class="message">{message}</span>
    {/if}
    <span class="right">
        {#if vimMode}
            <span class="mode" data-mode={vimMode.split(' ')[0]}>{vimMode.toUpperCase()}</span>
        {/if}
        <span>{wordFormatter.format(words)} {words === 1 ? 'word' : 'words'}</span>
    </span>
</footer>

<style>
    footer {
        position: fixed;
        inset: auto 0 0 0;
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 8px 18px 10px;
        font-size: 12px;
        letter-spacing: 0.02em;
        color: var(--color-muted);
        opacity: 0.75;
        transition: opacity 400ms ease;
        pointer-events: none;
    }

    footer.hidden {
        opacity: 0;
    }

    .title {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
    }

    .dirty {
        color: var(--color-accent);
    }

    .message {
        color: var(--color-foreground);
    }

    .right {
        margin-left: auto;
        display: flex;
        gap: 16px;
        font-variant-numeric: tabular-nums;
    }

    .mode {
        font-weight: 600;
        letter-spacing: 0.08em;
    }

    .mode[data-mode='insert'] {
        color: var(--color-code);
    }

    .mode[data-mode='visual'] {
        color: var(--color-emphasis);
    }

    .mode[data-mode='replace'] {
        color: var(--color-strong);
    }
</style>
