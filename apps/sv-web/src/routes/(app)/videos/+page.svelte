<script lang="ts">
	import VideoGrid from '$lib/components/video-grid.svelte';
	import { remoteGetAllVideos } from '$lib/remote/channels.remote';
</script>

<VideoGrid
	fetchVideos={({ limit, offset, filter, sort }) =>
		remoteGetAllVideos({ limit, offset, filter, sort })}
	key="all-videos"
/>
