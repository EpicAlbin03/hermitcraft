<script lang="ts">
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import type { ComponentProps } from 'svelte';
	import { ShieldIcon, VideoIcon } from '@lucide/svelte';
	import { page } from '$app/state';
	import { useSidebar } from '$lib/components/ui/sidebar/index.js';
	import { siteConfig } from '$lib/config/site-config';
	import { TwitterSVG } from '$lib/assets/svg';
	import type { SidebarCreator } from '$lib/remote/creators.remote';
	import { buildSidebarCreatorItems, buildSidebarLinkItems, buildSidebarMapItems } from './model';
	import SidebarCreatorsSection from './sidebar-creators-section.svelte';
	import SidebarSiteLinksSection from './sidebar-site-links-section.svelte';
	import SidebarMapDownloadsSection from './sidebar-map-downloads-section.svelte';

	type Props = ComponentProps<typeof Sidebar.Root> & {
		creators: SidebarCreator[];
	};

	let {
		ref = $bindable(null),
		collapsible = 'offcanvas',
		creators,
		...restProps
	}: Props = $props();

	const sidebar = useSidebar();

	function closeMobileIfOpen() {
		if (sidebar.openMobile) sidebar.setOpenMobile(false);
	}

	let sectionsOpen = $state({
		creators: true,
		links: false,
		maps: false
	});

	const creatorItems = $derived(buildSidebarCreatorItems(creators, page.url.pathname));
	const linkItems = $derived(buildSidebarLinkItems());
	const mapItems = $derived(buildSidebarMapItems());
	const videosActive = $derived(page.url.pathname.startsWith('/videos'));
	const privacyActive = $derived(page.url.pathname.startsWith('/privacy'));
</script>

<Sidebar.Root {collapsible} {...restProps}>
	<Sidebar.Header>
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<Sidebar.MenuButton
					size="lg"
					class="flex justify-center p-0 hover:bg-transparent active:bg-transparent"
				>
					{#snippet child({ props })}
						<a href="/videos" {...props} onclick={closeMobileIfOpen}>
							<enhanced:img
								src="../../../../static/hermitcraft-banner.png"
								alt="Hermitcraft"
								class="w-48 rounded-md object-cover"
							/>
						</a>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Header>
	<Sidebar.Content class="no-scrollbar">
		<Sidebar.Group class="pt-0">
			<Sidebar.Menu>
				<Sidebar.MenuItem>
					<Sidebar.MenuButton isActive={videosActive}>
						{#snippet child({ props })}
							<a {...props} href="/videos" onclick={closeMobileIfOpen}>
								<VideoIcon />
								<span>Videos</span>
							</a>
						{/snippet}
					</Sidebar.MenuButton>
				</Sidebar.MenuItem>

				<SidebarCreatorsSection
					items={creatorItems}
					isOpen={sectionsOpen.creators}
					setOpen={(open) => (sectionsOpen.creators = open)}
					isMobile={sidebar.isMobile}
					onNavigate={closeMobileIfOpen}
				/>
				<SidebarSiteLinksSection
					items={linkItems}
					isOpen={sectionsOpen.links}
					setOpen={(open) => (sectionsOpen.links = open)}
				/>
				<SidebarMapDownloadsSection
					items={mapItems}
					isOpen={sectionsOpen.maps}
					setOpen={(open) => (sectionsOpen.maps = open)}
					onNavigate={closeMobileIfOpen}
					isMobile={sidebar.isMobile}
				/>
			</Sidebar.Menu>
		</Sidebar.Group>
		<Sidebar.Group class="mt-auto">
			<Sidebar.Menu>
				<Sidebar.MenuItem>
					<Sidebar.MenuButton tooltipContent="Privacy Policy" isActive={privacyActive}>
						{#snippet child({ props })}
							<a href="/privacy" {...props} onclick={closeMobileIfOpen}>
								<ShieldIcon class="h-4 w-4" />
								<span>Privacy Policy</span>
							</a>
						{/snippet}
					</Sidebar.MenuButton>
				</Sidebar.MenuItem>
				<Sidebar.MenuItem>
					<Sidebar.MenuButton tooltipContent="Built by @EpicAlbin03">
						{#snippet child({ props })}
							<a href={siteConfig.links.twitter} target="_blank" {...props}>
								<TwitterSVG class="h-4 w-4" />
								<span>Built by @EpicAlbin03</span>
							</a>
						{/snippet}
					</Sidebar.MenuButton>
				</Sidebar.MenuItem>
			</Sidebar.Menu>
		</Sidebar.Group>
	</Sidebar.Content>
	<Sidebar.Rail />
</Sidebar.Root>
