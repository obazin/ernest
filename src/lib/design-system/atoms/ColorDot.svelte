<script lang="ts">
    interface Props {
        /** A colour shown as data, such as a palette preview, rather than a theme token. */
        color: string;
    }

    let { color }: Props = $props();
</script>

<span class="size-3 rounded-full" style:background={color}></span>
