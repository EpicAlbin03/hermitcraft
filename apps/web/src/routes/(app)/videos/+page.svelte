<script lang="ts">
	import MetaData from '$lib/components/metadata.svelte';
	import VideoGrid from '$lib/components/video-grid.svelte';
	import { remoteGetAllVideos, type VideoQueryParams } from '$lib/remote/creators.remote';

	const title = 'Videos';
	const description =
		'Watch the latest Minecraft videos and episodes from all Hermitcraft members.';
</script>

<MetaData {title} {description} />

{#key 'all-videos'}
	<VideoGrid
		fetchVideos={({ limit, offset, filter, sort, onlyHermitCraft }: VideoQueryParams) =>
			remoteGetAllVideos({ limit, offset, filter, sort, onlyHermitCraft })}
		key="all-videos"
	/>
{/key}
