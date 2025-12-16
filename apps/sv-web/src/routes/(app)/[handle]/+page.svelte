<script lang="ts">
	import { remoteGetChannelDetails, remoteGetChannelVideos } from '$lib/remote/channels.remote';
	import ChannelHeader from '$lib/components/channel-header.svelte';
	import VideoGrid from '$lib/components/video-grid.svelte';
	import MetaData from '$lib/components/metadata.svelte';

	const { params } = $props();
	const handle = $derived(params.handle);
	const channel = $derived(await remoteGetChannelDetails(handle));

	const title = $derived(channel.ytName);
	const description = $derived(
		`Watch the latest Hermitcraft Minecraft videos and episodes from ${channel.ytName}.`
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
