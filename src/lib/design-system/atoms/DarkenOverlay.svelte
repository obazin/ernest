<script lang="ts">
    interface Props {
        /** How far everything brighter than mid grey is pulled down to it, from 0 to 1. */
        strength: number;
    }

    let { strength }: Props = $props();
</script>

<!--
    A mid-grey layer over the whole window in darken blend mode: colours
    lighter than the grey are pulled towards it and darker ones are left as
    they are, which lowers the contrast of bright text and pages. It ignores
    the pointer, so everything below stays interactive.
-->
{#if strength > 0}
    <div
        class="pointer-events-none fixed inset-0 z-50 bg-darken-overlay mix-blend-darken"
        style:opacity={strength}
        aria-hidden="true"
    ></div>
{/if}
