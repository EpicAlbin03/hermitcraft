<script lang="ts">
	import VideoGrid from '$lib/components/video-grid.svelte';
	import { remoteGetAllVideos } from '$lib/remote/channels.remote';
</script>

<VideoGrid
	fetchVideos={({ limit, offset, filter }) => remoteGetAllVideos({ limit, offset, filter })}
	key="all-videos"
/>
