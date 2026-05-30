<script lang="ts">
	import CreatorHeader from '$lib/components/creator-header.svelte';
	import MetaData from '$lib/components/metadata.svelte';
	import { remoteGetCreatorDetails } from '$lib/remote/creators.remote';
	import VideoFeed from '$lib/components/video-feed/video-feed.svelte';
	import type { PageProps } from './$types';

	let { params }: PageProps = $props();

	const handle = $derived(params.handle);
	const creator = $derived(await remoteGetCreatorDetails(handle));
</script>

<svelte:boundary>
	<MetaData
		title={creator.ytName}
		description={`Watch the latest Hermitcraft Minecraft videos and episodes from ${creator.ytName}.`}
	/>

	<CreatorHeader {creator} {handle} />
	<VideoFeed source={{ type: 'creator', ytChannelId: creator.ytChannelId }} {creator} />
</svelte:boundary>
