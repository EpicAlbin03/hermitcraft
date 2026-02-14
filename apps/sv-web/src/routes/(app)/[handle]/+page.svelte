<script lang="ts">
	import { remoteGetChannelDetails, remoteGetChannelVideos } from '$lib/remote/channels.remote';
	import ChannelHeader from '$lib/components/channel-header.svelte';
	import VideoGrid from '$lib/components/video-grid.svelte';
	import MetaData from '$lib/components/metadata.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton';

	const { params } = $props();
	const handle = $derived(params.handle as string);
</script>

{#if handle}
	<svelte:boundary>
		{#await remoteGetChannelDetails(handle) then channel}
			<MetaData
				title={channel.ytName}
				description={`Watch the latest Hermitcraft Minecraft videos and episodes from ${channel.ytName}.`}
			/>

			{#key channel.ytChannelId}
				<ChannelHeader {channel} {handle} />
				<VideoGrid
					fetchVideos={({ limit, offset, filter, sort, onlyHermitCraft }) =>
						remoteGetChannelVideos({
							ytChannelId: channel.ytChannelId,
							limit,
							offset,
							filter,
							sort,
							onlyHermitCraft
						})}
					key={channel.ytChannelId}
					{channel}
				/>
			{/key}
		{/await}

		{#snippet pending()}
			<div class="space-y-6">
				<div class="space-y-3">
					<Skeleton class="h-32 w-full rounded-xl" />
					<div class="flex items-center gap-3">
						<Skeleton class="h-16 w-16 rounded-full" />
						<div class="space-y-2">
							<Skeleton class="h-6 w-56" />
							<Skeleton class="h-4 w-40" />
						</div>
					</div>
				</div>
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{#each [1, 2, 3, 4, 5, 6] as item (item)}
						<div class="space-y-2">
							<Skeleton class="aspect-video w-full rounded-lg" />
							<Skeleton class="h-4 w-11/12" />
							<Skeleton class="h-4 w-2/3" />
						</div>
					{/each}
				</div>
			</div>
		{/snippet}
	</svelte:boundary>
{/if}
