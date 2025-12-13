<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';

	let props: SVGAttributes<SVGElement> = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" {...props}>
	<path
		fill="none"
		stroke="currentColor"
		stroke-linejoin="round"
		d="M16 1.5h-3.5V16c0 1.5-1.5 3-3 3s-3-.5-3-3c0-2 1.899-3.339 3.5-3V9.5c-6.12 0-7 5-7 6.5s.977 6.5 6.5 6.5c4.522 0 6.5-3.5 6.5-6v-8c1.146 1.018 2.922 1.357 5 1.5V6.5c-3.017 0-5-2.654-5-5Z"
		stroke-width="2"
	/>
</svg>
