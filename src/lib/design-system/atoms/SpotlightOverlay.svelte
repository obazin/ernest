<script lang="ts">
    interface Props {
        /** Screen y of the clear centre, in pixels. */
        centre: number;
        /** Opacity of the fade where it is thickest, from 0 to 1. */
        strength: number;
    }

    let { centre, strength }: Props = $props();
</script>

<!--
    A radial fade to the page colour, clear around a point on the window's
    vertical midline and thickening with distance from it. The SVG is twice
    the window in each direction and centred on the point, so its edges stay
    off screen wherever the point sits. The ellipse is twice as wide as it is
    tall, which keeps a whole line of text clear. It ignores the pointer, so
    everything below stays interactive.
-->
<svg
    class="pointer-events-none fixed top-0 left-1/2 overscan text-background"
    style:transform="translate(-50%, calc({centre}px - 50%))"
    style:opacity={strength}
    aria-hidden="true"
>
    <defs>
        <radialGradient
            id="spotlight-fade"
            gradientTransform="translate(0.5 0.5) scale(2 1) translate(-0.5 -0.5)"
        >
            <stop offset="0" stop-color="currentColor" stop-opacity="0" />
            <stop offset="0.1" stop-color="currentColor" stop-opacity="0" />
            <stop offset="0.3" stop-color="currentColor" stop-opacity="1" />
        </radialGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#spotlight-fade)" />
</svg>
