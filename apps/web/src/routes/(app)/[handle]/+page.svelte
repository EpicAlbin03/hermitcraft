<script lang="ts">
	import CreatorHeader from '$lib/components/creator-header.svelte';
	import CreatorPageSkeleton from '$lib/components/creator-page-skeleton.svelte';
	import MetaData from '$lib/components/metadata.svelte';
	import { SkeletonDevToolsContext } from '$lib/config/skeleton-dev-tools.svelte';
	import { remoteGetCreatorDetails } from '$lib/remote/creators.remote';
	import VideoFeed from '$lib/components/video-feed/video-feed.svelte';
	import type { PageProps } from './$types';

	let { params }: PageProps = $props();

	const skeletonDevTools = SkeletonDevToolsContext.get();
	const handle = $derived(params.handle);
	const showSkeletons = $derived(skeletonDevTools.enabled);
</script>

{#if showSkeletons}
	<MetaData title="Loading creator" description="Loading creator videos and details." />
	<CreatorPageSkeleton />
{:else}
	<svelte:boundary>
		{@const creator = await remoteGetCreatorDetails(handle)}
		<MetaData
			title={creator.ytName}
			description={`Watch the latest Hermitcraft Minecraft videos and episodes from ${creator.ytName}.`}
		/>

		<CreatorHeader {creator} {handle} />
		<VideoFeed source={{ type: 'creator', ytChannelId: creator.ytChannelId }} {creator} />

		{#snippet pending()}
			<CreatorPageSkeleton />
		{/snippet}
	</svelte:boundary>
{/if}
