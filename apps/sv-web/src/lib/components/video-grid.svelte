<script lang="ts">
	import { useResizeObserver, useIntersectionObserver, watch } from 'runed';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { AspectRatio } from '$lib/components/ui/aspect-ratio';
	import * as Card from '$lib/components/ui/card';
	import * as Tabs from '$lib/components/ui/tabs';
	import { IsTailwindBreakpoint } from '$lib/hooks/is-tailwind-breakpoint.svelte';
	import { useSidebarSpace } from '$lib/hooks/use-sidebar-space.svelte';
	import { Eye, ThumbsUp, MessageCircle, Calendar } from '@lucide/svelte';
	import type { ChannelVideos } from '$lib/remote/channels.remote';
	import { formatCompactNumber, formatDate } from '$lib/utils';
	import { formatVideoDuration } from '$lib/format-duration';
	import { Spinner } from '$lib/components/ui/spinner';
	import type { VideoFilter } from '$lib/db/queries';

	type Props = {
		fetchVideos: (params: {
			limit: number;
			offset: number;
			filter: VideoFilter;
		}) => Promise<ChannelVideos>;
		key: string;
	};

	const { fetchVideos, key }: Props = $props();

	const VIDEO_CARD_MIN_WIDTH = 260;
	const VIDEO_CARD_MAX_WIDTH = 420;
	const VIDEO_CARD_MAX_COLUMNS = 6;
	const ROWS_PER_BATCH = 3;

	const validFilters: VideoFilter[] = ['videos', 'shorts', 'livestreams'];
	const tabLabels: Record<VideoFilter, string> = {
		videos: 'Videos',
		shorts: 'Shorts',
		livestreams: 'Livestreams'
	};

	let videoGridElement = $state<HTMLElement | null>(null);
	let sentinelElement = $state<HTMLElement | null>(null);
	let videoGridWidth = $state(0);
	let videoGridGap = $state(16);

	let videos = $state<ChannelVideos>([]);
	let isLoading = $state(false);
	let hasMore = $state(true);
	let isIntersecting = $state(false);
	let error = $state<string | null>(null);

	const activeFilter = $derived.by((): VideoFilter => {
		const filterParam = page.url.searchParams.get('filter');
		if (filterParam && validFilters.includes(filterParam as VideoFilter)) {
			return filterParam as VideoFilter;
		}
		return 'videos';
	});

	function handleTabChange(newFilter: VideoFilter) {
		const url = new URL(page.url);
		if (newFilter === 'videos') {
			url.searchParams.delete('filter');
		} else {
			url.searchParams.set('filter', newFilter);
		}
		goto(url.toString(), { replaceState: true, noScroll: true, keepFocus: true });
	}

	// Reset state when key or filter changes
	watch(
		() => [key, activeFilter] as const,
		() => {
			videos = [];
			hasMore = true;
			error = null;
			isLoading = false;
		}
	);

	const isTailwindBreakpoint = $derived(new IsTailwindBreakpoint().current);
	const sidebarSpace = useSidebarSpace(() => isTailwindBreakpoint);
	const shouldReserveSidebarSpace = $derived(sidebarSpace.shouldReserveSidebarSpace);
	const contentWidthRaw = $derived(sidebarSpace.contentWidthRaw);

	useResizeObserver(
		() => videoGridElement,
		(entries) => {
			const entry = entries[0];
			if (!entry) return;
			videoGridWidth = entry.contentRect.width;
			const gapValue = getComputedStyle(entry.target).columnGap;
			const parsedGap = Number.parseFloat(gapValue);
			if (!Number.isNaN(parsedGap)) {
				videoGridGap = parsedGap;
			}
		}
	);

	const fallbackVideoColumnsByBreakpoint = $derived({
		xs: 1,
		sm: 2,
		md: shouldReserveSidebarSpace ? 1 : 2,
		lg: shouldReserveSidebarSpace ? 2 : 3,
		xl: shouldReserveSidebarSpace ? 3 : 4,
		'2xl': shouldReserveSidebarSpace ? 5 : 6
	});
	const fallbackVideoColumns = $derived(
		fallbackVideoColumnsByBreakpoint[isTailwindBreakpoint] ?? 1
	);

	function getColumnsForWidth(width: number): number {
		if (width <= 0) {
			return fallbackVideoColumns;
		}

		for (let cols = VIDEO_CARD_MAX_COLUMNS; cols >= 1; cols--) {
			const totalGap = Math.max(0, cols - 1) * videoGridGap;
			const cardWidth = (width - totalGap) / cols;
			if (cardWidth >= VIDEO_CARD_MIN_WIDTH && cardWidth <= VIDEO_CARD_MAX_WIDTH) {
				return cols;
			}
		}

		const widestWidth =
			(width - Math.max(0, VIDEO_CARD_MAX_COLUMNS - 1) * videoGridGap) / VIDEO_CARD_MAX_COLUMNS;
		if (widestWidth > VIDEO_CARD_MAX_WIDTH) {
			return VIDEO_CARD_MAX_COLUMNS;
		}

		const estimatedColumns = Math.floor(
			(width + videoGridGap) / (VIDEO_CARD_MIN_WIDTH + videoGridGap)
		);
		return Math.max(1, Math.min(estimatedColumns, VIDEO_CARD_MAX_COLUMNS));
	}

	const videoColumnCount = $derived(Math.max(1, getColumnsForWidth(videoGridWidth)));
	const batchSize = $derived(Math.max(6, videoColumnCount * ROWS_PER_BATCH));
	const currentTabLabel = $derived(tabLabels[activeFilter]);

	const videoGridTemplate = $derived(`repeat(${Math.max(1, videoColumnCount)}, minmax(0, 1fr))`);
	const videoSizes = $derived(
		[
			`(min-width: 1536px) calc(${contentWidthRaw} / ${fallbackVideoColumnsByBreakpoint['2xl']})`,
			`(min-width: 1280px) calc(${contentWidthRaw} / ${fallbackVideoColumnsByBreakpoint.xl})`,
			`(min-width: 1024px) calc(${contentWidthRaw} / ${fallbackVideoColumnsByBreakpoint.lg})`,
			`(min-width: 768px) calc(${contentWidthRaw} / ${fallbackVideoColumnsByBreakpoint.md})`,
			`(min-width: 640px) calc(${contentWidthRaw} / ${fallbackVideoColumnsByBreakpoint.sm})`,
			`calc(${contentWidthRaw} / ${fallbackVideoColumnsByBreakpoint.xs})`
		].join(', ')
	);

	async function loadMore() {
		if (isLoading || !hasMore || error) return;

		isLoading = true;
		try {
			const newVideos = await fetchVideos({
				limit: batchSize,
				offset: videos.length,
				filter: activeFilter
			});
			if (newVideos.length < batchSize) {
				hasMore = false;
			}
			videos = [...videos, ...newVideos];
		} catch (e) {
			console.error('Failed to load videos:', e);
			error = 'Failed to load videos';
			hasMore = false;
		} finally {
			isLoading = false;
		}
	}

	useIntersectionObserver(
		() => sentinelElement,
		(entries) => {
			const entry = entries[0];
			isIntersecting = entry?.isIntersecting ?? false;
		},
		{ rootMargin: '200px' }
	);

	$effect(() => {
		if (isIntersecting && hasMore && !isLoading && !error) {
			loadMore();
		}
	});
</script>

<div>
	<Tabs.Root value={activeFilter} onValueChange={(value) => handleTabChange(value as VideoFilter)}>
		<Tabs.List class="mb-4">
			<Tabs.Trigger value="videos">{tabLabels.videos}</Tabs.Trigger>
			<Tabs.Trigger value="shorts">{tabLabels.shorts}</Tabs.Trigger>
			<Tabs.Trigger value="livestreams">{tabLabels.livestreams}</Tabs.Trigger>
		</Tabs.List>

		<div
			bind:this={videoGridElement}
			class="grid gap-4 sm:gap-5"
			style:grid-template-columns={videoGridTemplate}
		>
			{#each videos as video (video.ytVideoId)}
				{@const formattedDuration = formatVideoDuration(video.duration)}
				<div class="group cursor-pointer">
					<Card.Root
						class="flex h-full flex-col p-0 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
					>
						<a href={`https://www.youtube.com/watch?v=${video.ytVideoId}`} target="_blank">
							<Card.Content class="flex h-full flex-col p-0">
								<AspectRatio ratio={16 / 9} class="relative overflow-hidden rounded-t-xl bg-muted">
									<img
										src={video.thumbnailUrl}
										alt={video.title}
										sizes={videoSizes}
										loading="lazy"
										decoding="async"
										class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
									/>
									{#if formattedDuration}
										<span
											class="absolute right-2 bottom-2 rounded bg-black/80 px-1.5 py-0.5 text-[11px] font-semibold text-white"
										>
											{formattedDuration}
										</span>
									{/if}
								</AspectRatio>
								<div class="flex flex-1 flex-col gap-2 p-4">
									<h3
										class="line-clamp-2 leading-snug font-semibold transition-colors group-hover:text-primary"
									>
										{@html video.title}
									</h3>
									<div class="flex flex-col gap-2 text-xs text-muted-foreground">
										<div class="flex items-center gap-3">
											<span class="flex items-center gap-1">
												<Eye class="h-3 w-3" />
												{formatCompactNumber(video.viewCount)}
											</span>
											<span class="flex items-center gap-1">
												<ThumbsUp class="h-3 w-3" />
												{formatCompactNumber(video.likeCount)}
											</span>
											<span class="flex items-center gap-1">
												<MessageCircle class="h-3 w-3" />
												{formatCompactNumber(video.commentCount)}
											</span>
										</div>
										<span class="flex items-center gap-1">
											<Calendar class="h-3 w-3" />
											{formatDate(video.publishedAt)}
										</span>
									</div>
								</div>
							</Card.Content>
						</a>
					</Card.Root>
				</div>
			{/each}
		</div>

		<div bind:this={sentinelElement} class="flex items-center justify-center py-8">
			{#if isLoading}
				<Spinner class="h-8 w-8" />
			{:else if error}
				<p class="text-sm text-destructive">{error}</p>
			{:else if !hasMore && videos.length > 0}
				<p class="text-sm text-muted-foreground">No more {currentTabLabel.toLowerCase()}</p>
			{:else if !hasMore && videos.length === 0}
				<p class="text-sm text-muted-foreground">No {currentTabLabel.toLowerCase()} available</p>
			{/if}
		</div>
	</Tabs.Root>
</div>
