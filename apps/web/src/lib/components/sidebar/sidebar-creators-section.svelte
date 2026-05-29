<script lang="ts">
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import { ChevronRightIcon, UsersIcon } from '@lucide/svelte';
	import { cn } from '$lib/utils';
	import type { SidebarCreatorItem } from './model';
	import SidebarLiveAction from './sidebar-live-action.svelte';

	type Props = {
		items: SidebarCreatorItem[];
		isOpen: boolean;
		setOpen: (open: boolean) => void;
		isMobile: boolean;
		onNavigate: () => void;
	};

	const { items, isOpen, setOpen, isMobile, onNavigate }: Props = $props();
</script>

<Collapsible.Root open={isOpen} onOpenChange={setOpen} class="group/collapsible">
	{#snippet child({ props })}
		<Sidebar.MenuItem {...props}>
			<Collapsible.Trigger class="pr-2!">
				{#snippet child({ props })}
					<Sidebar.MenuButton {...props} tooltipContent="Members">
						<UsersIcon />
						<span>Members</span>
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
							<Sidebar.MenuSubButton isActive={item.isActive}>
								{#snippet child({ props })}
									<a
										href={item.url}
										onclick={onNavigate}
										data-sveltekit-preload-data="false"
										{...props}
									>
										<Avatar.Root class={cn('h-4 w-4 rounded-full text-[8px]')}>
											<Avatar.Image src={item.avatarUrl} alt={item.title} />
											<Avatar.Fallback>{item.title.slice(0, 2).toUpperCase()}</Avatar.Fallback>
										</Avatar.Root>
										<span class="max-w-40">{item.title}</span>
									</a>
								{/snippet}
							</Sidebar.MenuSubButton>
							<SidebarLiveAction
								{isMobile}
								isTwitchLive={item.isTwitchLive}
								twitchUserLogin={item.twitchUserLogin}
								ytLiveVideoId={item.ytLiveVideoId}
							/>
						</Sidebar.MenuSubItem>
					{/each}
				</Sidebar.MenuSub>
			</Collapsible.Content>
		</Sidebar.MenuItem>
	{/snippet}
</Collapsible.Root>
