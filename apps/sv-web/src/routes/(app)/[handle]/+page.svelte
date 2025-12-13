<script lang="ts">
	import { remoteGetChannelDetails, remoteGetChannelVideos } from '$lib/remote/channels.remote';
	import ChannelHeader from '$lib/components/channel-header.svelte';
	import VideoGrid from '$lib/components/video-grid.svelte';
	import type { PageProps } from './$types';
	import MetaData from '$lib/components/metadata.svelte';

	const { data }: PageProps = $props();
	const handle = $derived(data.handle);
	const channel = $derived(await remoteGetChannelDetails(handle));

	const title = $derived(`${channel.ytName} - HermitCraft Minecraft Videos & Episodes`);
	const description = $derived(
		`Watch the latest HermitCraft Minecraft videos and episodes from ${channel.ytName}.`
	);
</script>

<MetaData {title} {description} />

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
