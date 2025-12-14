<script lang="ts">
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import type { ComponentProps, Component } from 'svelte';
	import {
		ChevronRightIcon,
		LinkIcon,
		MapIcon,
		UsersIcon,
		VideoIcon,
		EllipsisIcon,
		CircleIcon,
		DownloadIcon,
		ExternalLinkIcon,
		ShieldIcon
	} from '@lucide/svelte';
	import { links } from '$lib/assets/data/links';
	import { maps } from '$lib/assets/data/maps';
	import { cn } from '$lib/utils';
	import type { SidebarChannel } from '$lib/remote/channels.remote';
	import { page } from '$app/state';
	import { useSidebar } from '$lib/components/ui/sidebar/index.js';
	import { TwitchSVG, TwitterSVG, YoutubeSVG } from '$lib/assets/svg';
	import { siteConfig } from '$lib/config/site-config';

	type Props = ComponentProps<typeof Sidebar.Root> & {
		channels: SidebarChannel[];
	};

	let {
		ref = $bindable(null),
		collapsible = 'offcanvas',
		channels,
		...restProps
	}: Props = $props();

	const sidebar = useSidebar();

	type Item = {
		title: string;
		icon: Component;
		url: string;
		isActive?: boolean;
	};

	type NestedItem = { title: string; url: string };

	type SubItem = {
		title: string;
		url: string;
		icon?: string | Component;
		iconClass?: string;
		isActive?: boolean;
		// member-specific
		twitchUserLogin?: string;
		isTwitchLive?: boolean;
		ytLiveVideoId?: string;
		truncate?: boolean;
		// link-specific
		targetBlank?: boolean;
		// map-specific
		items?: NestedItem[];
	};

	type DropdownKey = 'members' | 'links' | 'maps';

	type DropdownItem = {
		key: DropdownKey;
		title: string;
		icon: Component;
		items: SubItem[];
	};

	const items = $derived<Item[]>([
		{
			title: 'Videos',
			icon: VideoIcon,
			url: '/videos',
			isActive: page.url.pathname.startsWith('/videos')
		}
	]);

	let openStates = $state<Record<DropdownKey, boolean>>({
		members: true,
		links: false,
		maps: false
	});

	const dropdownItems = $derived<DropdownItem[]>([
		{
			key: 'members',
			title: 'Members',
			icon: UsersIcon,
			items: channels
				.map((channel) => ({
					title: channel.ytName,
					url: `/${channel.ytHandle}`,
					icon: channel.ytAvatarUrl,
					iconClass: 'rounded-full h-5 w-5',
					isActive: page.url.pathname.startsWith(`/${channel.ytHandle}`),
					twitchUserLogin: channel.twitchUserLogin ?? undefined,
					isTwitchLive: channel.isTwitchLive,
					ytLiveVideoId: channel.ytLiveVideoId ?? undefined,
					truncate: true
				}))
				.sort((a, b) => a.title.localeCompare(b.title))
		},
		{
			key: 'links',
			title: 'Links',
			icon: LinkIcon,
			items: links.map((link) => ({
				title: link.title,
				url: link.url,
				icon: link.icon,
				targetBlank: true
			}))
		},
		{
			key: 'maps',
			title: 'Maps',
			icon: MapIcon,
			items: maps.map((map) => {
				if ('url' in map) {
					return { title: map.title, url: map.url, icon: '/favicon-32x32.png' };
				}
				const items: NestedItem[] = [
					{ title: 'Java', url: map.javaUrl },
					{ title: 'Bedrock', url: map.bedrockUrl },
					{ title: 'Mcworld', url: map.mcwUrl },
					...(map.mcMarketplaceUrl ? [{ title: 'MC Marketplace', url: map.mcMarketplaceUrl }] : [])
				];
				return { title: map.title, url: items[0]!.url, icon: '/favicon-32x32.png', items };
			})
		}
	]);
</script>

<Sidebar.Root {collapsible} {...restProps}>
	<Sidebar.Header>
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<Sidebar.MenuButton size="lg" class="p-0 hover:bg-transparent active:bg-transparent">
					{#snippet child({ props })}
						<a href="/videos" {...props}>
							<img
								src="/hermitcraft-banner.png"
								alt="Hermitcraft"
								class="mx-auto w-48 rounded-md object-cover"
								width="192"
								height="64"
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
				{#each items as item (item.title)}
					<Sidebar.MenuItem>
						<Sidebar.MenuButton isActive={item.isActive}>
							{#snippet child({ props })}
								<a {...props} href={item.url}>
									<item.icon />
									<span>{item.title}</span>
								</a>
							{/snippet}
						</Sidebar.MenuButton>
					</Sidebar.MenuItem>
				{/each}
				{#each dropdownItems as item (item.key)}
					<Collapsible.Root
						open={openStates[item.key]}
						onOpenChange={(v) => (openStates[item.key] = v)}
						class="group/collapsible"
					>
						{#snippet child({ props })}
							<Sidebar.MenuItem {...props}>
								<Collapsible.Trigger class="pr-2!">
									{#snippet child({ props })}
										<Sidebar.MenuButton {...props} tooltipContent={item.title}>
											{#if item.icon}
												<item.icon />
											{/if}
											<span>{item.title}</span>
											<ChevronRightIcon
												class="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90"
											/>
										</Sidebar.MenuButton>
									{/snippet}
								</Collapsible.Trigger>
								<Collapsible.Content>
									<Sidebar.MenuSub class="mr-0 pr-0">
										{#each item.items ?? [] as subItem (subItem.title)}
											<Sidebar.MenuSubItem
												class={subItem.items?.length ? 'cursor-default' : undefined}
											>
												{#if subItem.items?.length}
													<DropdownMenu.Root>
														<DropdownMenu.Trigger>
															{#snippet child({ props })}
																<Sidebar.MenuSubButton {...props} isActive={subItem.isActive}>
																	{#if subItem.icon}
																		{#if typeof subItem.icon === 'string'}
																			<Avatar.Root class={cn('h-4 w-4 text-[8px]', subItem.iconClass)}>
																				<Avatar.Image src={subItem.icon} alt={subItem.title} />
																				<Avatar.Fallback>{subItem.title.slice(0, 2).toUpperCase()}</Avatar.Fallback>
																			</Avatar.Root>
																		{:else}
																			<subItem.icon />
																		{/if}
																	{/if}
																	<span>{subItem.title}</span>
																	<EllipsisIcon class="ml-auto h-4 w-4" />
																</Sidebar.MenuSubButton>
															{/snippet}
														</DropdownMenu.Trigger>
														<DropdownMenu.Content
															side={sidebar.isMobile ? 'bottom' : 'right'}
															align={sidebar.isMobile ? 'end' : 'start'}
														>
															{#each subItem.items as childItem}
																<DropdownMenu.Item class="cursor-pointer">
																	{#snippet child({ props })}
																		<a href={childItem.url} {...props}>
																			{#if childItem.url.includes('https://')}
																				<ExternalLinkIcon class="h-4 w-4" />
																			{:else}
																				<DownloadIcon class="h-4 w-4" />
																			{/if}
																			{childItem.title}
																		</a>
																	{/snippet}
																</DropdownMenu.Item>
															{/each}
														</DropdownMenu.Content>
													</DropdownMenu.Root>
												{:else}
													<Sidebar.MenuSubButton isActive={subItem.isActive}>
														{#snippet child({ props })}
															<a
																href={subItem.url}
																target={subItem.targetBlank ? '_blank' : undefined}
																{...props}
															>
																{#if subItem.icon}
																	{#if typeof subItem.icon === 'string'}
																		<Avatar.Root class={cn('h-4 w-4 text-[8px]', subItem.iconClass)}>
																			<Avatar.Image src={subItem.icon} alt={subItem.title} />
																			<Avatar.Fallback>{subItem.title.slice(0, 2).toUpperCase()}</Avatar.Fallback>
																		</Avatar.Root>
																	{:else}
																		<subItem.icon />
																	{/if}
																{/if}
																<span class:max-w-40={subItem.truncate}>{subItem.title}</span>
																{#if item.key === 'maps'}
																	<DownloadIcon class="ml-auto h-4 w-4" />
																{/if}
															</a>
														{/snippet}
													</Sidebar.MenuSubButton>
													{#if subItem.isTwitchLive && subItem.ytLiveVideoId}
														<DropdownMenu.Root>
															<DropdownMenu.Trigger>
																{#snippet child({ props })}
																	<Sidebar.MenuAction {...props} class="top-1 h-6 w-6">
																		<CircleIcon
																			class="size-2.5! fill-destructive text-destructive"
																		/>
																		<span class="sr-only">Live</span>
																	</Sidebar.MenuAction>
																{/snippet}
															</DropdownMenu.Trigger>
															<DropdownMenu.Content
																side={sidebar.isMobile ? 'bottom' : 'right'}
																align={sidebar.isMobile ? 'end' : 'start'}
															>
																<DropdownMenu.Label
																	class="px-2 py-1.5 text-xs text-muted-foreground"
																>
																	Watch Live
																</DropdownMenu.Label>
																{#if subItem.ytLiveVideoId}
																	<DropdownMenu.Item class="cursor-pointer">
																		{#snippet child({ props })}
																			<a
																				{...props}
																				href={`https://www.youtube.com/watch?v=${subItem.ytLiveVideoId}`}
																				target="_blank"
																			>
																				<YoutubeSVG class="h-4 w-4" />
																				YouTube
																			</a>
																		{/snippet}
																	</DropdownMenu.Item>
																{/if}
																{#if subItem.isTwitchLive && subItem.twitchUserLogin}
																	<DropdownMenu.Item class="cursor-pointer">
																		{#snippet child({ props })}
																			<a
																				{...props}
																				href={`https://www.twitch.tv/${subItem.twitchUserLogin}`}
																				target="_blank"
																			>
																				<TwitchSVG class="h-4 w-4" />
																				Twitch
																			</a>
																		{/snippet}
																	</DropdownMenu.Item>
																{/if}
															</DropdownMenu.Content>
														</DropdownMenu.Root>
													{:else if subItem.isTwitchLive}
														<Sidebar.MenuAction class="top-1 h-6 w-6">
															{#snippet child({ props })}
																<a
																	{...props}
																	href={`https://www.twitch.tv/${subItem.twitchUserLogin}`}
																	target="_blank"
																>
																	<CircleIcon class="size-2.5! fill-destructive text-destructive" />
																	<span class="sr-only">Live</span>
																</a>
															{/snippet}
														</Sidebar.MenuAction>
													{:else if subItem.ytLiveVideoId}
														<Sidebar.MenuAction class="top-1 h-6 w-6">
															{#snippet child({ props })}
																<a
																	{...props}
																	href={`https://www.youtube.com/watch?v=${subItem.ytLiveVideoId}`}
																	target="_blank"
																>
																	<CircleIcon class="size-2.5! fill-destructive text-destructive" />
																	<span class="sr-only">Live</span>
																</a>
															{/snippet}
														</Sidebar.MenuAction>
													{/if}
												{/if}
											</Sidebar.MenuSubItem>
										{/each}
									</Sidebar.MenuSub>
								</Collapsible.Content>
							</Sidebar.MenuItem>
						{/snippet}
					</Collapsible.Root>
				{/each}
			</Sidebar.Menu>
		</Sidebar.Group>
		<Sidebar.Group class="mt-auto">
			<Sidebar.Menu>
				<Sidebar.MenuItem>
					<Sidebar.MenuButton
						tooltipContent="Privacy Policy"
						isActive={page.url.pathname.startsWith('/privacy')}
					>
						{#snippet child({ props })}
							<a href="/privacy" {...props}>
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
