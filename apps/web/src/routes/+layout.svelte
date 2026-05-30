<script lang="ts">
	import SkeletonDevToggle from '$lib/components/skeleton-dev-toggle.svelte';
	import TailwindIndicator from '$lib/components/tailwind-indicator.svelte';
	import { SkeletonDevTools, SkeletonDevToolsContext } from '$lib/config/skeleton-dev-tools.svelte';
	import { UserConfig, UserConfigContext } from '$lib/config/user-config.svelte';
	import type { LayoutProps } from './$types';
	import './layout.css';
	import { ModeWatcher } from 'mode-watcher';

	let { children, data }: LayoutProps = $props();

	// svelte-ignore state_referenced_locally
	UserConfigContext.set(new UserConfig(data.userConfig));
	SkeletonDevToolsContext.set(new SkeletonDevTools());
</script>

<ModeWatcher />
<SkeletonDevToggle />
<TailwindIndicator />
{@render children()}
