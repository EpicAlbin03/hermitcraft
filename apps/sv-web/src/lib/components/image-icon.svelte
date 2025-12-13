<script lang="ts">
	import { cn } from '$lib/utils';

	type Props = {
		url: string;
		alt: string;
		class?: string;
		fallback?: LucideIcon;
	};

	let { url, alt, class: className, fallback: Fallback }: Props = $props();
	let failed = $state(false);
</script>

{#if failed && Fallback}
	<Fallback class={cn('h-4 w-4', className)} />
{:else}
	<img
		src={url}
		{alt}
		width={16}
		height={16}
		class={cn('h-4 w-4', className)}
		onerror={() => (failed = true)}
	/>
{/if}
