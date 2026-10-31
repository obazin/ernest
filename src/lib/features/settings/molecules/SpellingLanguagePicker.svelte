<script lang="ts">
    import ToggleChip from '../../../design-system/atoms/ToggleChip.svelte';
    import { spellingLanguages, type SpellingLanguage } from '../../../spellingLanguages';

    interface Props {
        /** The chosen languages, in the order of `spellingLanguages`; never empty. */
        value: SpellingLanguage[];
    }

    let { value = $bindable() }: Props = $props();

    /** Adds or removes a language, keeping their order and at least one. */
    function toggle(code: SpellingLanguage) {
        if (value.includes(code) && value.length === 1) return;
        value = spellingLanguages
            .map((language) => language.code)
            .filter((candidate) => (candidate === code) !== value.includes(candidate));
    }
</script>

<div class="flex flex-wrap gap-1.5" role="group" aria-label="Spelling languages">
    {#each spellingLanguages as language (language.code)}
        {@const chosen = value.includes(language.code)}
        {@const last = chosen && value.length === 1}
        <ToggleChip
            pressed={chosen}
            locked={last}
            title={last ? 'At least one language stays on' : undefined}
            onclick={() => toggle(language.code)}>{language.name}</ToggleChip
        >
    {/each}
</div>
