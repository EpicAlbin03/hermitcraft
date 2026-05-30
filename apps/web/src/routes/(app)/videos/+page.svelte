<script lang="ts">
	import MetaData from '$lib/components/metadata.svelte';
	import { SkeletonDevToolsContext } from '$lib/config/skeleton-dev-tools.svelte';
	import VideoFeedGridSkeleton from '$lib/components/video-feed/video-feed-grid-skeleton.svelte';
	import VideoFeed from '$lib/components/video-feed/video-feed.svelte';

	const title = 'Videos';
	const description =
		'Watch the latest Minecraft videos and episodes from all Hermitcraft members.';

	const skeletonDevTools = SkeletonDevToolsContext.get();
	const showSkeletons = $derived(skeletonDevTools.enabled);
</script>

<MetaData {title} {description} />

{#if showSkeletons}
	<VideoFeedGridSkeleton />
{:else}
	<VideoFeed source={{ type: 'all' }} />
{/if}
