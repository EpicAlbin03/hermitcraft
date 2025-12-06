<script lang="ts">
	import TailwindIndicator from '$lib/components/tailwind-indicator.svelte';
	import { UserConfig, UserConfigContext } from '$lib/config/user-config.svelte';
	import type { LayoutProps } from './$types';
	import './layout.css';
	import { ModeWatcher } from 'mode-watcher';

	let { children, data }: LayoutProps = $props();

	// svelte-ignore state_referenced_locally
	const userConfig = UserConfigContext.set(new UserConfig(data.userConfig));
</script>

<ModeWatcher />
<TailwindIndicator />
{@render children()}
