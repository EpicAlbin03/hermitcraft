<script lang="ts">
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import type { ComponentProps } from 'svelte';
	import { ChevronRightIcon, LinkIcon, MapIcon, UsersIcon } from '@lucide/svelte';
	import type { Channel } from '@hc/db';
	import { links } from '$lib/assets/data/links';
	import { maps } from '$lib/assets/data/maps';

	type Props = ComponentProps<typeof Sidebar.Root> & {
		channels: Channel[];
	};

	let { ref = $bindable(null), collapsible = 'icon', channels, ...restProps }: Props = $props();

	const items = [
		{
			title: 'Members',
			icon: UsersIcon,
			isOpen: true,
			items: channels
				.map((channel) => ({
					title: channel.name,
					url: `/${channel.customUrl}`,
					img: channel.thumbnailUrl
				}))
				.sort((a, b) => a.title.localeCompare(b.title))
		},
		{
			title: 'Links',
			icon: LinkIcon,
			isOpen: false,
			items: links.map((link) => ({
				title: link.title,
				url: link.link
			}))
		},
		{
			title: 'Maps',
			icon: MapIcon,
			isOpen: false,
			items: maps.map((map) => ({
				title: map.title,
				url: map.link
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
															{#if subItem.img}
																<img
																	src={subItem.img}
																	alt={subItem.title}
																	class="h-4 w-4 rounded-full"
																/>
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
