<script lang="ts">
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import type { ComponentProps, Component } from 'svelte';
	import {
		ChevronRightIcon,
		LinkIcon,
		MapIcon,
		UsersIcon,
		VideoIcon,
		EllipsisIcon
	} from '@lucide/svelte';
	import { links } from '$lib/assets/data/links';
	import { maps } from '$lib/assets/data/maps';
	import { cn } from '$lib/utils';
	import type { SidebarChannel } from '$lib/remote/channels.remote';
	import { page } from '$app/state';
	import { useSidebar } from '$lib/components/ui/sidebar/index.js';

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

	type DropdownItem = {
		title: string;
		icon: Component;
		isOpen: boolean;
		items: SubItem[];
	};

	type Item = {
		title: string;
		icon: Component;
		url: string;
		isActive?: boolean;
	};

	type SubItem = {
		title: string;
		url: string;
		icon?: string | Component;
		iconClass?: string;
		isActive?: boolean;
		targetBlank?: boolean;
		items?: {
			title: string;
			url: string;
		}[];
	};

	const items = $derived<Item[]>([
		{
			title: 'Videos',
			icon: VideoIcon,
			url: '/videos',
			isActive: page.url.pathname.startsWith('/videos')
		}
	]);

	const dropdownItems = $derived<DropdownItem[]>([
		{
			title: 'Members',
			icon: UsersIcon,
			isOpen: true,
			items: channels
				.map((channel) => ({
					title: channel.name,
					url: `/${channel.handle}`,
					icon: channel.thumbnailUrl,
					iconClass: 'rounded-full h-5 w-5',
					isActive: page.url.pathname.startsWith(`/${channel.handle}`)
				}))
				.sort((a, b) => a.title.localeCompare(b.title))
		},
		{
			title: 'Links',
			icon: LinkIcon,
			isOpen: false,
			items: links.map((link) => ({
				title: link.title,
				url: link.url,
				icon: link.icon,
				targetBlank: true
			}))
		},
		{
			title: 'Maps',
			icon: MapIcon,
			isOpen: false,
			items: maps
				.map((map) => {
					const items = [];
					if ('javaLink' in map && map.javaLink) items.push({ title: 'Java', url: map.javaLink });
					if ('bedrockLink' in map && map.bedrockLink)
						items.push({ title: 'Bedrock', url: map.bedrockLink });
					if ('mcwLink' in map && map.mcwLink) items.push({ title: 'Mcworld', url: map.mcwLink });

					return {
						title: map.title,
						url: map.url,
						icon: '/favicon-32x32.png',
						items: items.length > 0 ? items : undefined
					};
				})
				.reverse()
		}
	]);
</script>

<Sidebar.Root {collapsible} {...restProps}>
	<Sidebar.Content class="no-scrollbar">
		<Sidebar.Group>
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
				{#each dropdownItems as item (item.title)}
					<Collapsible.Root open={item.isOpen} class="group/collapsible">
						{#snippet child({ props })}
							<Sidebar.MenuItem {...props}>
								<Collapsible.Trigger>
									{#snippet child({ props })}
										<Sidebar.MenuButton
											{...props}
											tooltipContent={item.title}
											isActive={item.items.some((subItem) => subItem.isActive)}
										>
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
									<Sidebar.MenuSub>
										{#each item.items ?? [] as subItem (subItem.title)}
											<Sidebar.MenuSubItem>
												{#if subItem.items?.length}
													<DropdownMenu.Root>
														<DropdownMenu.Trigger>
															{#snippet child({ props })}
																<Sidebar.MenuSubButton {...props} isActive={subItem.isActive}>
																	{#if subItem.icon}
																		{#if typeof subItem.icon === 'string'}
																			<img
																				src={subItem.icon}
																				alt={subItem.title}
																				class={cn('h-4 w-4', subItem.iconClass)}
																			/>
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
																<DropdownMenu.Item>
																	{#snippet child({ props })}
																		<a href={childItem.url} {...props}>
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
																		<img
																			src={subItem.icon}
																			alt={subItem.title}
																			class={cn('h-4 w-4', subItem.iconClass)}
																		/>
																	{:else}
																		<subItem.icon />
																	{/if}
																{/if}
																<span>{subItem.title}</span>
															</a>
														{/snippet}
													</Sidebar.MenuSubButton>
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
								<span>Privacy Policy</span>
							</a>
						{/snippet}
					</Sidebar.MenuButton>
				</Sidebar.MenuItem>
				<Sidebar.MenuItem>
					<Sidebar.MenuButton tooltipContent="Built by @EpicAlbin03">
						{#snippet child({ props })}
							<a href="https://x.com/EpicAlbin03" target="_blank" {...props}>
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
