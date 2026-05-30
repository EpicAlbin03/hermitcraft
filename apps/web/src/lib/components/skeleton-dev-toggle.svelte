<script lang="ts">
	import { dev } from '$app/environment';
	import { SkeletonDevToolsContext } from '$lib/config/skeleton-dev-tools.svelte';
	import { Button } from '$lib/components/ui/button';

	const skeletonDevTools = SkeletonDevToolsContext.get();
	const skeletonsEnabled = $derived(skeletonDevTools.enabled);
</script>

{#if dev}
	<Button
		variant={skeletonsEnabled ? 'default' : 'secondary'}
		size="sm"
		class="fixed right-1 bottom-9 z-50 shadow-md"
		onclick={() => skeletonDevTools.toggle()}
	>
		Skeletons: {skeletonsEnabled ? 'On' : 'Off'}
	</Button>
{/if}
