<script lang="ts">
	import { Skeleton } from '$lib/components/ui/skeleton';

	const videoSkeletonIndexes = Array.from({ length: 8 }, (_, index) => index);
</script>

<div class="mb-4 flex flex-wrap-reverse items-center justify-between gap-4">
	<div class="flex flex-wrap items-center gap-2">
		<Skeleton class="h-9 w-20 rounded-md" />
		<Skeleton class="h-9 w-20 rounded-md" />
		<Skeleton class="h-9 w-24 rounded-md" />
	</div>

	<div class="flex flex-wrap items-center gap-4">
		<div class="flex items-center gap-2">
			<Skeleton class="h-6 w-11 rounded-full" />
			<Skeleton class="h-4 w-28" />
		</div>
		<Skeleton class="h-9 w-30 rounded-md" />
	</div>
</div>

<div
	class="grid gap-4 sm:gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))]"
>
	{#each videoSkeletonIndexes as index (index)}
		<div class="overflow-hidden rounded-xl border bg-card shadow-sm">
			<div class="relative">
				<Skeleton class="aspect-video w-full rounded-none" />
				<Skeleton class="absolute right-2 bottom-2 h-5 w-12 rounded" />
			</div>

			<div class="flex flex-1 flex-col gap-3 p-4">
				<div class="space-y-2">
					<Skeleton class="h-5 w-11/12" />
					<Skeleton class="h-5 w-7/12" />
				</div>

				<div class="space-y-2 text-xs">
					<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
						<Skeleton class="h-3 w-16" />
						<Skeleton class="h-3 w-16" />
						<Skeleton class="h-3 w-24" />
					</div>
					<div class="flex items-center gap-3">
						<Skeleton class="h-3 w-20" />
						<Skeleton class="h-3 w-24" />
					</div>
				</div>
			</div>
		</div>
	{/each}
</div>
