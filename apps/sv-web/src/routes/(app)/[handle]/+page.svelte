<script lang="ts">
	import { remoteGetChannelDetails, remoteGetChannelVideos } from '$lib/remote/channels.remote';
	import ChannelHeader from '$lib/components/channel-header.svelte';
	import VideoGrid from '$lib/components/video-grid.svelte';
	import MetaData from '$lib/components/metadata.svelte';

	const { params } = $props();
	const handle = $derived(params.handle as string);
</script>

{#if handle}
	{@const channel = await remoteGetChannelDetails(handle)}
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
{/if}
