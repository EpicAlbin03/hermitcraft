<script lang="ts">
	import {
		remoteGetCreatorDetails,
		remoteGetCreatorVideos,
		type VideoQueryParams
	} from '$lib/remote/creators.remote';
	import CreatorHeader from '$lib/components/creator-header.svelte';
	import VideoGrid from '$lib/components/video-grid.svelte';
	import MetaData from '$lib/components/metadata.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton';

	const { params } = $props();
	const handle = $derived(params.handle as string);
</script>

{#if handle}
	<svelte:boundary>
		{#await remoteGetCreatorDetails(handle) then creator}
			<MetaData
				title={creator.ytName}
				description={`Watch the latest Hermitcraft Minecraft videos and episodes from ${creator.ytName}.`}
			/>

			{#key creator.ytChannelId}
				<CreatorHeader {creator} {handle} />
				<VideoGrid
					fetchVideos={({ limit, offset, filter, sort, onlyHermitCraft }: VideoQueryParams) =>
						remoteGetCreatorVideos({
							ytChannelId: creator.ytChannelId,
							limit,
							offset,
							filter,
							sort,
							onlyHermitCraft
						})}
					key={creator.ytChannelId}
					{creator}
				/>
			{/key}
		{/await}

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
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{#each [1, 2, 3, 4, 5, 6] as item (item)}
						<div class="overflow-hidden rounded-xl border bg-card shadow-sm">
							<Skeleton class="aspect-video w-full rounded-lg" />
							<div class="space-y-3 p-4">
								<div class="space-y-2">
									<Skeleton class="h-4 w-11/12" />
									<Skeleton class="h-4 w-8/12" />
								</div>
								<div class="space-y-2">
									<div class="flex items-center gap-3">
										<Skeleton class="h-3 w-14" />
										<Skeleton class="h-3 w-12" />
										<Skeleton class="h-3 w-10" />
									</div>
									<div class="flex items-center gap-3">
										<Skeleton class="h-3 w-16" />
										<Skeleton class="h-3 w-24" />
									</div>
								</div>
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/snippet}
	</svelte:boundary>
{/if}
