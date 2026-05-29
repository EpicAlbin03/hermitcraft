<script lang="ts">
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { CircleIcon } from '@lucide/svelte';
	import { TwitchSVG, YoutubeSVG } from '$lib/assets/svg';

	type LiveDestination = {
		title: string;
		url: string;
		icon: typeof YoutubeSVG | typeof TwitchSVG;
	};

	type Props = {
		isMobile: boolean;
		isTwitchLive: boolean;
		twitchUserLogin?: string;
		ytLiveVideoId?: string;
	};

	const { isMobile, isTwitchLive, twitchUserLogin, ytLiveVideoId }: Props = $props();

	const liveDestinations = $derived.by(() => {
		const destinations: LiveDestination[] = [];

		if (ytLiveVideoId) {
			destinations.push({
				title: 'YouTube',
				url: `https://www.youtube.com/watch?v=${ytLiveVideoId}`,
				icon: YoutubeSVG
			});
		}

		if (isTwitchLive && twitchUserLogin) {
			destinations.push({
				title: 'Twitch',
				url: `https://www.twitch.tv/${twitchUserLogin}`,
				icon: TwitchSVG
			});
		}

		return destinations;
	});
</script>

{#if liveDestinations.length > 1}
	<DropdownMenu.Root>
		<DropdownMenu.Trigger>
			{#snippet child({ props })}
				<Sidebar.MenuAction {...props} class="top-0.5 h-6 w-6 hover:border">
					<CircleIcon class="size-2.5! fill-destructive text-destructive" />
					<span class="sr-only">Live</span>
				</Sidebar.MenuAction>
			{/snippet}
		</DropdownMenu.Trigger>
		<DropdownMenu.Content side={isMobile ? 'bottom' : 'right'} align={isMobile ? 'end' : 'start'}>
			<DropdownMenu.Label class="px-2 py-1.5 text-xs text-muted-foreground">
				Watch Live
			</DropdownMenu.Label>
			{#each liveDestinations as destination (destination.title)}
				<DropdownMenu.Item class="cursor-pointer">
					{#snippet child({ props })}
						<a {...props} href={destination.url} target="_blank">
							<destination.icon class="h-4 w-4" />
							{destination.title}
						</a>
					{/snippet}
				</DropdownMenu.Item>
			{/each}
		</DropdownMenu.Content>
	</DropdownMenu.Root>
{:else if liveDestinations[0]}
	<Sidebar.MenuAction class="top-0.5 h-6 w-6 hover:border">
		{#snippet child({ props })}
			<a {...props} href={liveDestinations[0].url} target="_blank">
				<CircleIcon class="size-2.5! fill-destructive text-destructive" />
				<span class="sr-only">{liveDestinations[0].title} live</span>
			</a>
		{/snippet}
	</Sidebar.MenuAction>
{/if}
