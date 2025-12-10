<script lang="ts">
	import { remoteGetChannelDetails, remoteGetChannelVideos } from '$lib/remote/channels.remote';
	import ChannelHeader from '$lib/components/channel-header.svelte';
	import VideoGrid from '$lib/components/video-grid.svelte';
	import type { PageProps } from './$types';

	const { data }: PageProps = $props();
	const handle = $derived(data.handle);
	const channel = $derived(await remoteGetChannelDetails(handle));
</script>

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
