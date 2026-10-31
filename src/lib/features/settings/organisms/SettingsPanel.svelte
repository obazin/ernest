<script lang="ts">
    import { onMount } from 'svelte';
    import SectionHeading from '../../../design-system/atoms/SectionHeading.svelte';
    import TextArea from '../../../design-system/atoms/TextArea.svelte';
    import TextInput from '../../../design-system/atoms/TextInput.svelte';
    import CheckboxField from '../../../design-system/molecules/CheckboxField.svelte';
    import SliderField from '../../../design-system/molecules/SliderField.svelte';
    import SidePanel from '../../../design-system/organisms/SidePanel.svelte';
    import { backend } from '../../../backend';
    import { parseMappings } from '../../../editor/vim/mappings';
    import { limits, type BooleanSetting, type Settings } from '../../../settings';
    import { palettes } from '../../../themes/palettes';
    import FontPicker from '../molecules/FontPicker.svelte';
    import SpellingLanguagePicker from '../molecules/SpellingLanguagePicker.svelte';
    import ThemeCard from '../molecules/ThemeCard.svelte';

    interface Props {
        settings: Settings;
        onclose: () => void;
    }

    let { settings = $bindable(), onclose }: Props = $props();

    let fonts = $state<string[]>([]);
    let fontsLoading = $state(true);

    const mappingErrors = $derived(parseMappings(settings.vimMappings).errors);

    const toggles: {
        key: BooleanSetting;
        label: string;
        hint: string;
    }[] = [
        { key: 'vim', label: 'Vim mode', hint: ':w :q :e :sav :enew :colo' },
        {
            key: 'vimClipboard',
            label: 'Share clipboard with system',
            hint: 'Vim yanks and pastes use the system clipboard',
        },
        {
            key: 'typewriter',
            label: 'Typewriter scrolling',
            hint: 'Keep the current line at a fixed height',
        },
        { key: 'focusMode', label: 'Focus mode', hint: 'Dim every paragraph but this one' },
        {
            key: 'livePreview',
            label: 'Live preview',
            hint: 'Hide Markdown syntax off the current line',
        },
        {
            key: 'spellcheck',
            label: 'Spell checking',
            hint: 'In the languages below, plus words you add',
        },
        { key: 'autosave', label: 'Autosave', hint: 'Write named files when you pause' },
    ];

    const sliders: {
        key: 'fontSize' | 'lineHeight' | 'columnWidth';
        label: string;
        format: (value: number) => string;
    }[] = [
        { key: 'fontSize', label: 'Size', format: (value) => `${value}px` },
        { key: 'lineHeight', label: 'Line height', format: (value) => value.toFixed(2) },
        { key: 'columnWidth', label: 'Column width', format: (value) => `${value}px` },
    ];

    onMount(() => {
        backend
            .listSystemFonts()
            .then((names) => (fonts = names))
            .finally(() => (fontsLoading = false));
    });
</script>

<SidePanel title="Settings" {onclose}>
    <section>
        <SectionHeading>Theme</SectionHeading>
        <div class="grid grid-cols-2 gap-2">
            {#each palettes as palette (palette.identifier)}
                <ThemeCard
                    {palette}
                    selected={settings.theme === palette.identifier}
                    onclick={() => (settings.theme = palette.identifier)}
                />
            {/each}
        </div>
    </section>

    <section>
        <SectionHeading>Anti-glare</SectionHeading>
        <SliderField
            label="Strength"
            minimum={limits.antiGlare.minimum}
            maximum={limits.antiGlare.maximum}
            step={limits.antiGlare.step}
            format={(value) => (value === 0 ? 'off' : `${value}%`)}
            bind:value={settings.antiGlare}
        />
    </section>

    <section>
        <SectionHeading>Typography</SectionHeading>
        {#each sliders as slider (slider.key)}
            <SliderField
                label={slider.label}
                minimum={limits[slider.key].minimum}
                maximum={limits[slider.key].maximum}
                step={limits[slider.key].step}
                format={slider.format}
                bind:value={settings[slider.key]}
            />
        {/each}
        <div class="mt-4">
            <FontPicker {fonts} loading={fontsLoading} bind:value={settings.fontFamily} />
        </div>
    </section>

    <section>
        <SectionHeading>Writing</SectionHeading>
        {#each toggles as toggle (toggle.key)}
            <CheckboxField
                label={toggle.label}
                hint={toggle.hint}
                bind:checked={settings[toggle.key]}
            />
            {#if toggle.key === 'typewriter'}
                <div class="pl-6">
                    <SliderField
                        label="Anchor"
                        disabled={!settings.typewriter}
                        minimum={limits.typewriterAnchor.minimum}
                        maximum={limits.typewriterAnchor.maximum}
                        step={limits.typewriterAnchor.step}
                        format={(value) => `${value}%`}
                        bind:value={settings.typewriterAnchor}
                    />
                    <SliderField
                        label="Glide"
                        disabled={!settings.typewriter}
                        minimum={limits.typewriterGlide.minimum}
                        maximum={limits.typewriterGlide.maximum}
                        step={limits.typewriterGlide.step}
                        format={(value) => `${value} ms`}
                        bind:value={settings.typewriterGlide}
                    />
                </div>
            {/if}
            {#if toggle.key === 'spellcheck' && settings.spellcheck}
                <div class="pb-1.5 pl-6">
                    <SpellingLanguagePicker bind:value={settings.spellingLanguages} />
                </div>
            {/if}
        {/each}
    </section>

    {#if settings.vim}
        <section>
            <SectionHeading>Vim</SectionHeading>
            <label class="flex flex-wrap items-center gap-x-2.5 py-1.5">
                <span class="flex-1">Leave insert mode with</span>
                <TextInput
                    class="w-key-sequence"
                    placeholder="e.g. jk"
                    maxlength={3}
                    bind:value={settings.vimEscapeSequence}
                />
                <span class="basis-full text-caption text-muted"
                    >Two or three keys typed quickly act as Escape</span
                >
            </label>
            <label class="flex flex-col gap-1 py-1.5">
                <span>Mappings</span>
                <span class="text-caption text-muted"
                    >One per line, as in a vimrc: nnoremap Y y$</span
                >
                <TextArea
                    rows={5}
                    placeholder={'" Comments start with a quote\nnnoremap Y y$'}
                    bind:value={settings.vimMappings}
                />
                <!-- The palettes have no error colour; the accent stands out on all of them. -->
                {#each mappingErrors as error (error)}
                    <span class="text-caption text-accent">{error}</span>
                {/each}
            </label>
        </section>
    {/if}
</SidePanel>
