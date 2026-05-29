<script lang="ts">
	import AppSidebar from '$lib/components/sidebar/app-sidebar.svelte';
	import SidebarLoading from '$lib/components/sidebar/sidebar-loading.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import ToggleMode from '$lib/components/toggle-mode.svelte';
	import { remoteGetSidebarCreators } from '$lib/remote/creators.remote';
	import { UserConfigContext } from '$lib/config/user-config.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { GithubSVG } from '$lib/assets/svg';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { InfoIcon } from '@lucide/svelte';
	import { siteConfig } from '$lib/config/site-config';
	import ScrollToTop from '$lib/components/scroll-to-top.svelte';

	let { children } = $props();

	const userConfig = UserConfigContext.get();
	const sidebarCreators = remoteGetSidebarCreators();
</script>

<Sidebar.Provider
	open={userConfig.current.sidebarOpen}
	onOpenChange={(open) => {
		userConfig.setConfig({ sidebarOpen: open });
	}}
>
	{#await sidebarCreators}
		<SidebarLoading />
	{:then creators}
		<AppSidebar {creators} />
	{/await}
	<Sidebar.Inset>
		<header
			class="flex h-16 shrink-0 items-center justify-between gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12"
		>
			<div class="flex items-center gap-2 px-4">
				<Sidebar.Trigger class="-ml-1" />
				<a
					href="https://www.youtube.com"
					target="_blank"
					class="flex items-center"
					aria-label="Developed with YouTube"
				>
					<enhanced:img
						src="../../../static/developed-with-yt.png"
						alt="Developed with YouTube"
						class="h-16 w-auto dark:hidden"
					/>
					<enhanced:img
						src="../../../static/developed-with-yt-dark.png"
						alt="Developed with YouTube"
						class="hidden h-16 w-auto dark:block"
					/>
				</a>
			</div>
			<div class="flex items-center gap-2 px-4">
				<Popover.Root>
					<Popover.Trigger class="size-7">
						{#snippet child({ props })}
							<Button variant="ghost" size="icon" aria-label="App info" {...props}>
								<InfoIcon class="h-4 w-4" />
							</Button>
						{/snippet}
					</Popover.Trigger>
					<Popover.Content class="w-96 max-w-[calc(100vw-2rem)]" align="end" collisionPadding={16}>
						<div class="grid gap-4">
							<h4 class="leading-none font-medium">App Info</h4>
							<ul class="flex list-none flex-col gap-2 p-0 text-sm text-muted-foreground">
								<li>
									The latest 15 videos for each creator are updated every 2 minutes. Therefore, new
									videos can take up to 2 minutes before they appear. It also checks if creators are
									live on Twitch and YouTube. Videos, live status, and creator details are cached
									for 2 minutes.
								</li>
								<li>
									The creator list and old videos are updated once a day at 06:00 UTC / 01:00 ET /
									22:00 PT / 06:00 GMT / 07:00 CET. The creator list is cached for 1 hour.
								</li>
								<li>
									If you encounter any issues or find something missing, please open an issue on <a
										href={`${siteConfig.links.github}/issues`}
										target="_blank"
										class="underline hover:text-primary">GitHub</a
									>.
								</li>
							</ul>
						</div>
					</Popover.Content>
				</Popover.Root>
				<Button
					variant="ghost"
					size="icon"
					class="size-7"
					href={siteConfig.links.github}
					target="_blank"
					aria-label="GitHub repository"
				>
					<GithubSVG class="h-4 w-4" />
				</Button>
				<ToggleMode />
			</div>
		</header>
		<div class="flex flex-1 flex-col gap-6 p-4 pt-0">
			{@render children()}
		</div>
		<ScrollToTop />
	</Sidebar.Inset>
</Sidebar.Provider>
