<script lang="ts">
	import VideoGrid from '$lib/components/video-grid.svelte';
	import { remoteGetAllVideos } from '$lib/remote/channels.remote';

	const videos = $derived(await remoteGetAllVideos());
</script>

<VideoGrid {videos} />
