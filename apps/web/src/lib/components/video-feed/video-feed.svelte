<script lang="ts">
	import { useResizeObserver, useIntersectionObserver } from 'runed';
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import * as Tabs from '$lib/components/ui/tabs';
	import { Spinner } from '$lib/components/ui/spinner';
	import { IsTailwindBreakpoint } from '$lib/hooks/is-tailwind-breakpoint.svelte';
	import { useSidebarSpace } from '$lib/hooks/use-sidebar-space.svelte';
	import { UserConfigContext } from '$lib/config/user-config.svelte';
	import type { CreatorDetails } from '$lib/remote/creators.remote';
	import {
		parseVideoFilter,
		parseVideoSort,
		setVideoFilterSearchParam,
		setVideoSortSearchParam,
		videoFilterLabels,
		type VideoFilter,
		type VideoSort
	} from './contract';
	import {
		fetchVideoFeed,
		getVideoFeedKey,
		type VideoFeedItem,
		type VideoFeedSource
	} from './remote';
	import VideoFeedToolbar from './video-feed-toolbar.svelte';
	import VideoCard from './video-card.svelte';

	type Props = {
		source: VideoFeedSource;
		creator?: CreatorDetails;
	};

	const { source, creator }: Props = $props();

	const userConfig = UserConfigContext.get();
	let onlyHermitCraft = $derived(userConfig.current.onlyHermitCraft);

	const VIDEO_CARD_MIN_WIDTH = 260;
	const VIDEO_CARD_MAX_WIDTH = 420;
	const VIDEO_CARD_MAX_COLUMNS = 6;
	const ROWS_PER_BATCH = 3;

	let videoGridElement = $state<HTMLElement | null>(null);
	let sentinelElement = $state<HTMLElement | null>(null);
	let videoGridWidth = $state(0);
	let videoGridGap = $state(16);

	let videos = $state<VideoFeedItem[]>([]);
	let isLoading = $state(false);
	let hasMore = $state(true);
	let isIntersecting = $state(false);
	let error = $state<string | null>(null);
	let fetchVersion = $state(0);
	let currentFetchKey = $state('');

	const activeFilter = $derived.by(
		(): VideoFilter => parseVideoFilter(page.url.searchParams.get('filter'))
	);
	const activeSort = $derived.by(
		(): VideoSort => parseVideoSort(page.url.searchParams.get('sort'))
	);
	const fetchKey = $derived(
		`${getVideoFeedKey(source)}:${activeFilter}:${activeSort}:${onlyHermitCraft}`
	);

	$effect.pre(() => {
		const nextFetchKey = fetchKey;
		if (untrack(() => currentFetchKey) === nextFetchKey) {
			return;
		}

		currentFetchKey = nextFetchKey;
		fetchVersion++;
		videos = [];
		hasMore = true;
		error = null;
		isLoading = false;
	});

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

	function getColumnsForWidth(width: number) {
		if (width <= 0) {
			return fallbackVideoColumns;
		}

		for (let columns = VIDEO_CARD_MAX_COLUMNS; columns >= 1; columns--) {
			const totalGap = Math.max(0, columns - 1) * videoGridGap;
			const cardWidth = (width - totalGap) / columns;
			if (cardWidth >= VIDEO_CARD_MIN_WIDTH && cardWidth <= VIDEO_CARD_MAX_WIDTH) {
				return columns;
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

	function getBatchSizeForColumns(columns: number, loadedCount: number) {
		const safeColumns = Math.max(1, columns);
		const baselineRows = safeColumns >= 3 ? ROWS_PER_BATCH : ROWS_PER_BATCH + 1;
		const baselineBatchSize = safeColumns * baselineRows;
		const remainder = loadedCount % safeColumns;
		return remainder === 0 ? baselineBatchSize : baselineBatchSize - remainder;
	}

	const currentTabLabel = $derived(videoFilterLabels[activeFilter]);
	const rowsVisibleOnLoad = $derived(creator ? 2 : 3);
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

	function updateBrowseUrl(mutate: (url: URL) => void) {
		const url = new URL(page.url);
		mutate(url);
		goto(url.toString(), { replaceState: true, noScroll: true, keepFocus: true });
	}

	function handleFilterChange(filter: VideoFilter) {
		updateBrowseUrl((url) => setVideoFilterSearchParam(url, filter));
	}

	function handleSortChange(sort: VideoSort) {
		updateBrowseUrl((url) => setVideoSortSearchParam(url, sort));
	}

	async function loadMore() {
		if (isLoading || !hasMore || error) return;

		const currentVersion = fetchVersion;
		const requestBatchSize = getBatchSizeForColumns(videoColumnCount, videos.length);
		isLoading = true;

		try {
			const newVideos = await fetchVideoFeed(source, {
				limit: requestBatchSize,
				offset: videos.length,
				filter: activeFilter,
				sort: activeSort,
				onlyHermitCraft
			});

			if (currentVersion !== fetchVersion) return;
			if (newVideos.length < requestBatchSize) {
				hasMore = false;
			}
			videos = [...videos, ...newVideos];
		} catch (cause) {
			if (currentVersion !== fetchVersion) return;
			console.error('Failed to load videos:', cause);
			error = 'Failed to load videos';
			hasMore = false;
		} finally {
			if (currentVersion === fetchVersion) {
				isLoading = false;
			}
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
		const isInitialLoad = videos.length === 0;
		if ((isIntersecting || isInitialLoad) && hasMore && !isLoading && !error) {
			loadMore();
		}
	});
</script>

<div>
	<Tabs.Root
		value={activeFilter}
		onValueChange={(value) => handleFilterChange(value as VideoFilter)}
	>
		<VideoFeedToolbar
			{activeSort}
			{onlyHermitCraft}
			onSortChange={handleSortChange}
			onOnlyHermitCraftChange={(checked) => userConfig.setConfig({ onlyHermitCraft: checked })}
		/>

		<div
			bind:this={videoGridElement}
			class="grid gap-4 sm:gap-5"
			style:grid-template-columns={videoGridTemplate}
		>
			{#each videos as video, index (video.ytVideoId)}
				<VideoCard {video} {creator} {index} {videoSizes} {videoColumnCount} {rowsVisibleOnLoad} />
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
