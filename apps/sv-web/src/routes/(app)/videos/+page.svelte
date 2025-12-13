<script lang="ts">
	import MetaData from '$lib/components/metadata.svelte';
	import VideoGrid from '$lib/components/video-grid.svelte';
	import { remoteGetAllVideos } from '$lib/remote/channels.remote';

	const title = 'Hermitcraft Minecraft Videos & Episodes';
	const description =
		'Watch the latest Hermitcraft Minecraft videos and episodes from all Hermitcraft members.';
</script>

<MetaData {title} {description} />

<VideoGrid
	fetchVideos={({ limit, offset, filter, sort, onlyHermitCraft }) =>
		remoteGetAllVideos({ limit, offset, filter, sort, onlyHermitCraft })}
	key="all-videos"
/>
