<script lang="ts">
	import { page } from '$app/state';
	import { remoteGetChannelDetails, remoteGetChannelVideos } from '$lib/remote/channels.remote';
	import ChannelHeader from '$lib/components/channel-header.svelte';
	import VideoGrid from '$lib/components/video-grid.svelte';

	const handle = $derived(page.params.handle as string);
	const channel = $derived(await remoteGetChannelDetails(handle));
</script>

<ChannelHeader {channel} {handle} />
<VideoGrid
	fetchVideos={({ limit, offset, filter, sort }) =>
		remoteGetChannelVideos({ ytChannelId: channel.ytChannelId, limit, offset, filter, sort })}
	key={channel.ytChannelId}
	{channel}
/>
