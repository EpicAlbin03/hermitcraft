<script lang="ts">
	import AppSidebar from '$lib/components/app-sidebar.svelte';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import ToggleMode from '$lib/components/toggle-mode.svelte';
	import { remoteGetSidebarChannels, type SidebarChannel } from '$lib/remote/channels.remote';

	let { children } = $props();

	const channels = $derived<SidebarChannel[]>(await remoteGetSidebarChannels());
</script>

<Sidebar.Provider>
	<AppSidebar {channels} />
	<Sidebar.Inset>
		<header
			class="flex h-16 shrink-0 items-center justify-between gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12"
		>
			<div class="flex items-center gap-2 px-4">
				<Sidebar.Trigger class="-ml-1" />
				<Separator orientation="vertical" class="mr-2 data-[orientation=vertical]:h-4" />
			</div>
			<div class="flex items-center gap-2 px-4">
				<ToggleMode />
			</div>
		</header>
		<div class="flex flex-1 flex-col gap-4 p-4 pt-0">
			<div class="min-h-screen flex-1 rounded-xl bg-muted/50 md:min-h-min">
				{@render children()}
			</div>
		</div>
	</Sidebar.Inset>
</Sidebar.Provider>
