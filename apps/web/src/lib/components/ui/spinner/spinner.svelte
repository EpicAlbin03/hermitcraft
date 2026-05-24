<script lang="ts">
	import { cn } from '$lib/utils.js';
	import type { SVGAttributes } from 'svelte/elements';

	let {
		class: className,
		role = 'status',
		'aria-label': ariaLabel = 'Loading',
		...restProps
	}: SVGAttributes<SVGSVGElement> = $props();
</script>

<svg
	{role}
	aria-label={ariaLabel}
	class={cn('size-4 animate-spin', className)}
	fill="none"
	viewBox="0 0 24 24"
	{...restProps}
>
	<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
	<path class="opacity-75" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" fill="currentColor" />
</svg>
