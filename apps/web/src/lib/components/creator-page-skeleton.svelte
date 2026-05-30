<script lang="ts">
	import VideoFeedGridSkeleton from '$lib/components/video-feed/video-feed-grid-skeleton.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton';
</script>

<div class="space-y-6">
	<div class="w-full rounded-xl bg-card pb-4 shadow-sm md:pb-6">
		<Skeleton
			class="aspect-2/1 w-full rounded-t-xl sm:aspect-5/2 md:aspect-8/3 lg:aspect-4/1 xl:aspect-5/1 2xl:aspect-7/1"
		/>

		<div class="relative flex flex-col items-start gap-2 px-4 md:flex-row md:gap-6 md:px-6">
			<div class="relative z-10 -mt-12 shrink-0 md:mt-6">
				<Skeleton class="h-24 w-24 rounded-full border-4 border-card md:h-32 md:w-32" />
			</div>

			<div class="mt-2 flex flex-1 flex-col gap-3 md:mt-4">
				<div class="space-y-2">
					<div class="flex items-center gap-2">
						<Skeleton class="h-8 w-48 md:h-9 md:w-64" />
						<Skeleton class="h-8 w-14 rounded-md" />
					</div>
					<Skeleton class="h-5 w-28" />
				</div>

				<div class="flex flex-wrap items-center gap-x-4 gap-y-2">
					<Skeleton class="h-4 w-30" />
					<Skeleton class="h-4 w-20" />
					<Skeleton class="h-4 w-24" />
				</div>

				<div class="mt-2 max-w-xl space-y-2">
					<Skeleton class="h-4 w-full" />
					<Skeleton class="h-4 w-10/12" />
				</div>
			</div>

			<div class="absolute top-2 right-4 mt-2 flex max-w-md gap-2 md:static md:mt-6">
				<Skeleton class="hidden h-9 w-20 rounded-md xl:block" />
				<Skeleton class="hidden h-9 w-20 rounded-md xl:block" />
				<Skeleton class="h-9 w-18 rounded-md" />
			</div>
		</div>
	</div>

	<VideoFeedGridSkeleton />
</div>
