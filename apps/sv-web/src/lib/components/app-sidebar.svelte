<script lang="ts">
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import type { ComponentProps, Component } from 'svelte';
	import { ChevronRightIcon, LinkIcon, MapIcon, UsersIcon } from '@lucide/svelte';
	import { links } from '$lib/assets/data/links';
	import { maps } from '$lib/assets/data/maps';
	import { cn } from '$lib/utils';
	import type { SidebarChannel } from '$lib/remote/channels.remote';

	type Props = ComponentProps<typeof Sidebar.Root> & {
		channels: SidebarChannel[];
	};

	let { ref = $bindable(null), collapsible = 'icon', channels, ...restProps }: Props = $props();

	type Item = {
		title: string;
		icon: Component;
		isOpen: boolean;
		items: SubItem[];
	};

	type SubItem = {
		title: string;
		url: string;
		icon?: string | Component;
		iconClass?: string;
	};

	const items: Item[] = [
		{
			title: 'Members',
			icon: UsersIcon,
			isOpen: true,
			items: channels
				.map((channel) => ({
					title: channel.name,
					url: `/${channel.handle}`,
					icon: channel.thumbnailUrl,
					iconClass: 'rounded-full h-5 w-5'
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
				icon: link.icon
			}))
		},
		{
			title: 'Maps',
			icon: MapIcon,
			isOpen: false,
			items: maps.map((map) => ({
				title: map.title,
				url: map.url,
				icon: '/favicon-32x32.png'
			}))
		}
	];
</script>

<Sidebar.Root {collapsible} {...restProps}>
	<Sidebar.Content>
		<Sidebar.Group>
			<Sidebar.Menu>
				{#each items as item (item.title)}
					<Collapsible.Root open={item.isOpen} class="group/collapsible">
						{#snippet child({ props })}
							<Sidebar.MenuItem {...props}>
								<Collapsible.Trigger>
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
									<Sidebar.MenuSub>
										{#each item.items ?? [] as subItem (subItem.title)}
											<Sidebar.MenuSubItem>
												<Sidebar.MenuSubButton>
													{#snippet child({ props })}
														<a href={subItem.url} {...props}>
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
	</Sidebar.Content>
	<Sidebar.Rail />
</Sidebar.Root>
