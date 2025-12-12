<script lang="ts">
	import AppSidebar from '$lib/components/app-sidebar.svelte';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import ToggleMode from '$lib/components/toggle-mode.svelte';
	import { remoteGetSidebarChannels, type SidebarChannel } from '$lib/remote/channels.remote';
	import { UserConfigContext } from '$lib/config/user-config.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { GithubSVG } from '$lib/assets/svg';

	let { children } = $props();

	const channels = $derived<SidebarChannel[]>(await remoteGetSidebarChannels());
	const userConfig = UserConfigContext.get();
</script>

<Sidebar.Provider
	open={userConfig.current.sidebarOpen}
	onOpenChange={(open) => {
		userConfig.setConfig({ sidebarOpen: open });
	}}
>
	<AppSidebar {channels} />
	<Sidebar.Inset>
		<header
			class="flex h-16 shrink-0 items-center justify-between gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12"
		>
			<div class="flex items-center gap-2 px-4">
				<Sidebar.Trigger class="-ml-1" />
				<!-- <Separator orientation="vertical" class="mr-2 data-[orientation=vertical]:h-4" /> -->
			</div>
			<div class="flex items-center gap-2 px-4">
				<Button
					variant="ghost"
					size="icon"
					class="size-7"
					href="https://github.com/EpicAlbin03/hermitcraft"
					target="_blank"
				>
					<GithubSVG class="h-4 w-4" />
				</Button>
				<ToggleMode />
			</div>
		</header>
		<div class="flex flex-1 flex-col gap-6 p-4 pt-0">
			{@render children()}
		</div>
	</Sidebar.Inset>
</Sidebar.Provider>
