<script lang="ts">
	import MetaData from '$lib/components/metadata.svelte';
	import VideoFeed from '$lib/components/video-feed/video-feed.svelte';

	const title = 'Videos';
	const description =
		'Watch the latest Minecraft videos and episodes from all Hermitcraft members.';
</script>

<MetaData {title} {description} />
<VideoFeed source={{ type: 'all' }} />
