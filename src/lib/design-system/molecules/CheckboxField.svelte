<script lang="ts">
    interface Props {
        label: string;
        /** One line under the label saying what the option does. */
        hint: string;
        checked: boolean;
    }

    let { label, hint, checked = $bindable() }: Props = $props();
</script>

<label class="flex cursor-pointer items-start gap-2.5 py-1.5">
    <input class="accent-accent" type="checkbox" bind:checked />
    <span class="flex flex-col">
        <span>{label}</span>
        <span class="text-caption text-muted">{hint}</span>
    </span>
</label>
