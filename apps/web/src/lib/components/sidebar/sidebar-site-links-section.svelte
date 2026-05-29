<script lang="ts">
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import { ChevronRightIcon, GlobeIcon, LinkIcon } from '@lucide/svelte';
	import ImageIcon from '$lib/components/image-icon.svelte';
	import type { SidebarLinkItem } from './model';

	type Props = {
		items: SidebarLinkItem[];
		isOpen: boolean;
		setOpen: (open: boolean) => void;
	};

	const { items, isOpen, setOpen }: Props = $props();
</script>

<Collapsible.Root open={isOpen} onOpenChange={setOpen} class="group/collapsible">
	{#snippet child({ props })}
		<Sidebar.MenuItem {...props}>
			<Collapsible.Trigger class="pr-2!">
				{#snippet child({ props })}
					<Sidebar.MenuButton {...props} tooltipContent="Links">
						<LinkIcon />
						<span>Links</span>
						<ChevronRightIcon
							class="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90"
						/>
					</Sidebar.MenuButton>
				{/snippet}
			</Collapsible.Trigger>
			<Collapsible.Content>
				<Sidebar.MenuSub class="mr-0 pr-0">
					{#each items as item (item.url)}
						<Sidebar.MenuSubItem>
							<Sidebar.MenuSubButton>
								{#snippet child({ props })}
									<a href={item.url} target={item.targetBlank ? '_blank' : undefined} {...props}>
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
