<script lang="ts">
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import {
		ChevronRightIcon,
		DownloadIcon,
		EllipsisIcon,
		ExternalLinkIcon,
		GlobeIcon,
		MapIcon
	} from '@lucide/svelte';
	import ImageIcon from '$lib/components/image-icon.svelte';
	import type { SidebarMapItem } from './model';

	type Props = {
		items: SidebarMapItem[];
		isOpen: boolean;
		setOpen: (open: boolean) => void;
		onNavigate: () => void;
		isMobile: boolean;
	};

	const { items, isOpen, setOpen, onNavigate, isMobile }: Props = $props();
</script>

<Collapsible.Root open={isOpen} onOpenChange={setOpen} class="group/collapsible">
	{#snippet child({ props })}
		<Sidebar.MenuItem {...props}>
			<Collapsible.Trigger class="pr-2!">
				{#snippet child({ props })}
					<Sidebar.MenuButton {...props} tooltipContent="Maps">
						<MapIcon />
						<span>Maps</span>
						<ChevronRightIcon
							class="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90"
						/>
					</Sidebar.MenuButton>
				{/snippet}
			</Collapsible.Trigger>
			<Collapsible.Content>
				<Sidebar.MenuSub class="mr-0 pr-0">
					{#each items as item (item.title)}
						<Sidebar.MenuSubItem class={item.downloads.length > 1 ? 'cursor-default' : undefined}>
							{#if item.downloads.length > 1}
								<DropdownMenu.Root>
									<DropdownMenu.Trigger>
										{#snippet child({ props })}
											<Sidebar.MenuSubButton {...props}>
												{#if item.icon.type === 'image'}
													<ImageIcon
														url={item.icon.url}
														alt={item.icon.alt}
														class={item.icon.className ?? ''}
														fallback={GlobeIcon}
													/>
												{:else}
													<item.icon.component />
												{/if}
												<span>{item.title}</span>
												<EllipsisIcon class="ml-auto h-4 w-4" />
											</Sidebar.MenuSubButton>
										{/snippet}
									</DropdownMenu.Trigger>
									<DropdownMenu.Content
										side={isMobile ? 'bottom' : 'right'}
										align={isMobile ? 'end' : 'start'}
									>
										{#each item.downloads as download (download.title)}
											<DropdownMenu.Item class="cursor-pointer">
												{#snippet child({ props })}
													<a href={download.url} {...props}>
														{#if download.external}
															<ExternalLinkIcon class="h-4 w-4" />
														{:else}
															<DownloadIcon class="h-4 w-4" />
														{/if}
														{download.title}
													</a>
												{/snippet}
											</DropdownMenu.Item>
										{/each}
									</DropdownMenu.Content>
								</DropdownMenu.Root>
							{:else}
								<Sidebar.MenuSubButton>
									{#snippet child({ props })}
										<a href={item.primaryUrl} onclick={onNavigate} {...props}>
											{#if item.icon.type === 'image'}
												<ImageIcon
													url={item.icon.url}
													alt={item.icon.alt}
													class={item.icon.className ?? ''}
													fallback={GlobeIcon}
												/>
											{:else}
												<item.icon.component />
											{/if}
											<span>{item.title}</span>
											<DownloadIcon class="ml-auto h-4 w-4" />
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
