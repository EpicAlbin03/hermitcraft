<script lang="ts">
	import { remoteGetCreatorDetails } from '$lib/remote/creators.remote';
	import CreatorHeader from '$lib/components/creator-header.svelte';
	import MetaData from '$lib/components/metadata.svelte';
	import VideoFeed from '$lib/components/video-feed/video-feed.svelte';
	import VideoFeedGridSkeleton from '$lib/components/video-feed/video-feed-grid-skeleton.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import type { PageProps } from './$types';

	let { params }: PageProps = $props();

	const handle = $derived(params.handle);
</script>

<svelte:boundary>
	{@const creator = await remoteGetCreatorDetails(handle)}
	<MetaData
		title={creator.ytName}
		description={`Watch the latest Hermitcraft Minecraft videos and episodes from ${creator.ytName}.`}
	/>

	<CreatorHeader {creator} {handle} />
	<VideoFeed source={{ type: 'creator', ytChannelId: creator.ytChannelId }} {creator} />

	{#snippet pending()}
		<div class="space-y-6">
			<div class="space-y-3">
				<Skeleton class="h-32 w-full rounded-xl" />
				<div class="flex items-center gap-3">
					<Skeleton class="h-16 w-16 rounded-full" />
					<div class="space-y-2">
						<Skeleton class="h-6 w-56" />
						<Skeleton class="h-4 w-40" />
					</div>
				</div>
			</div>
			<VideoFeedGridSkeleton />
		</div>
	{/snippet}
</svelte:boundary>
