<script lang="ts">
	import TailwindIndicator from '$lib/components/tailwind-indicator.svelte';
	import './layout.css';
	import { ModeWatcher } from 'mode-watcher';

	let { children } = $props();
</script>

<ModeWatcher />
<TailwindIndicator />
{@render children()}
