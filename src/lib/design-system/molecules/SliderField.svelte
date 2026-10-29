<script lang="ts">
    interface Props {
        label: string;
        minimum: number;
        maximum: number;
        step: number;
        value: number;
        /** How the current value reads beside the slider (`18px`). */
        format: (value: number) => string;
    }

    let { label, minimum, maximum, step, value = $bindable(), format }: Props = $props();
</script>

<label class="mb-2 flex items-center gap-3">
    <span class="w-24 shrink-0">{label}</span>
    <input
        class="min-w-0 flex-1 accent-accent"
        type="range"
        min={minimum}
        max={maximum}
        {step}
        bind:value
    />
    <output class="w-14 shrink-0 text-right text-muted tabular-nums">{format(value)}</output>
</label>
