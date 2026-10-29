<script lang="ts">
    interface Props {
        /** The key the button stands for, shown as a key cap (`esc`). */
        key: string;
        /** What pressing it does, for assistive technology. */
        label: string;
        onclick: () => void;
    }

    let { key, label, onclick }: Props = $props();
</script>

<button
    class="cursor-pointer rounded-control border border-border px-1.5 py-px text-label text-muted"
    aria-label={label}
    {onclick}>{key}</button
>
