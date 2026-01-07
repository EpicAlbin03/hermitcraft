<script lang="ts">
	import { useResizeObserver, useIntersectionObserver } from 'runed';
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { AspectRatio } from '$lib/components/ui/aspect-ratio';
	import * as Card from '$lib/components/ui/card';
	import * as Tabs from '$lib/components/ui/tabs';
	import { IsTailwindBreakpoint } from '$lib/hooks/is-tailwind-breakpoint.svelte';
	import { useSidebarSpace } from '$lib/hooks/use-sidebar-space.svelte';
	import {
		Eye,
		ThumbsUp,
		MessageCircle,
		Calendar,
		CalendarArrowDown,
		CalendarArrowUp,
		Clock,
		CircleIcon
	} from '@lucide/svelte';
	import type { ChannelVideos, ChannelDetails } from '$lib/remote/channels.remote';
	import {
		formatCompactNumber,
		formatDate,
		formatRelativeTime,
		formatVideoDuration
	} from '$lib/format';
	import { Spinner } from '$lib/components/ui/spinner';
	import type { VideoFilter, VideoSort } from '$lib/services/db';
	import * as Select from '$lib/components/ui/select';
	import { Avatar, AvatarFallback, AvatarImage } from '$lib/components/ui/avatar';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { UserConfigContext } from '$lib/config/user-config.svelte';

	type VideoWithChannel = ChannelVideos[number] & {
		channelName?: string;
		channelAvatarUrl?: string;
		channelHandle?: string;
	};

	type Props = {
		fetchVideos: (params: {
			limit: number;
			offset: number;
			filter: VideoFilter;
			sort: VideoSort;
			onlyHermitCraft: boolean;
		}) => Promise<VideoWithChannel[]>;
		key: string;
		channel?: ChannelDetails;
	};

	const { fetchVideos, key, channel }: Props = $props();

	const userConfig = UserConfigContext.get();
	let onlyHermitCraft = $derived(userConfig.current.onlyHermitCraft);

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

	const validSorts: VideoSort[] = ['latest', 'most_viewed', 'most_liked', 'oldest'];
	type SortOption = {
		value: VideoSort;
		label: string;
		icon: LucideIcon;
	};
	const sortOptions: SortOption[] = [
		{ value: 'latest', label: 'Latest', icon: CalendarArrowDown },
		{ value: 'most_viewed', label: 'Views', icon: Eye },
		{ value: 'most_liked', label: 'Likes', icon: ThumbsUp },
		{ value: 'oldest', label: 'Oldest', icon: CalendarArrowUp }
	];

	let videoGridElement = $state<HTMLElement | null>(null);
	let sentinelElement = $state<HTMLElement | null>(null);
	let videoGridWidth = $state(0);
	let videoGridGap = $state(16);

	let videos = $state<VideoWithChannel[]>([]);
	let isLoading = $state(false);
	let hasMore = $state(true);
	let isIntersecting = $state(false);
	let error = $state<string | null>(null);
	let fetchVersion = $state(0);

	const activeFilter = $derived.by((): VideoFilter => {
		const filterParam = page.url.searchParams.get('filter');
		if (filterParam && validFilters.includes(filterParam as VideoFilter)) {
			return filterParam as VideoFilter;
		}
		return 'videos';
	});

	const activeSort = $derived.by((): VideoSort => {
		const sortParam = page.url.searchParams.get('sort');
		if (sortParam && validSorts.includes(sortParam as VideoSort)) {
			return sortParam as VideoSort;
		}
		return 'latest';
	});

	const selectedSortOption = $derived<SortOption>(
		sortOptions.find((s) => s.value === activeSort) ?? sortOptions[0]!
	);

	function handleTabChange(newFilter: VideoFilter) {
		const url = new URL(page.url);
		if (newFilter === 'videos') {
			url.searchParams.delete('filter');
		} else {
			url.searchParams.set('filter', newFilter);
		}
		goto(url.toString(), { replaceState: true, noScroll: true, keepFocus: true });
	}

	function handleSortChange(newSort: VideoSort) {
		const url = new URL(page.url);
		if (newSort === 'latest') {
			url.searchParams.delete('sort');
		} else {
			url.searchParams.set('sort', newSort);
		}
		goto(url.toString(), { replaceState: true, noScroll: true, keepFocus: true });
	}

	// Track current fetch params to detect changes
	let currentFetchKey = $state('');
	const fetchKey = $derived(`${key}:${activeFilter}:${activeSort}:${onlyHermitCraft}`);

	// Reset state when key, filter, sort, or onlyHermitCraft changes
	$effect.pre(() => {
		const newKey = fetchKey;
		if (untrack(() => currentFetchKey) !== newKey) {
			currentFetchKey = newKey;
			fetchVersion++;
			videos = [];
			hasMore = true;
			error = null;
			isLoading = false;
		}
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
	const rowsVisibleOnLoad = $derived(channel ? 2 : 3);

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

		const currentVersion = fetchVersion;
		isLoading = true;
		try {
			const newVideos = await fetchVideos({
				limit: batchSize,
				offset: videos.length,
				filter: activeFilter,
				sort: activeSort,
				onlyHermitCraft: onlyHermitCraft
			});
			// Discard stale results if filter/sort changed during fetch
			if (currentVersion !== fetchVersion) return;
			if (newVideos.length < batchSize) {
				hasMore = false;
			}
			videos = [...videos, ...newVideos];
		} catch (e) {
			if (currentVersion !== fetchVersion) return;
			console.error('Failed to load videos:', e);
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
		// For initial load (empty videos), don't require intersection - always load
		// For subsequent loads (pagination), require intersection with sentinel
		const isInitialLoad = videos.length === 0;
		if ((isIntersecting || isInitialLoad) && hasMore && !isLoading && !error) {
			loadMore();
		}
	});
</script>

<div>
	<Tabs.Root value={activeFilter} onValueChange={(value) => handleTabChange(value as VideoFilter)}>
		<div class="mb-4 flex flex-wrap-reverse items-center justify-between gap-4">
			<Tabs.List>
				<Tabs.Trigger value="videos">{tabLabels.videos}</Tabs.Trigger>
				<Tabs.Trigger value="shorts">{tabLabels.shorts}</Tabs.Trigger>
				<Tabs.Trigger value="livestreams">{tabLabels.livestreams}</Tabs.Trigger>
			</Tabs.List>

			<div class="flex items-center gap-4">
				<div class="flex items-center space-x-2">
					<Switch
						id="only-hermitcraft"
						bind:checked={onlyHermitCraft}
						onCheckedChange={(checked) => userConfig.setConfig({ onlyHermitCraft: checked })}
					/>
					<Label for="only-hermitcraft">Only Hermitcraft</Label>
				</div>

				<Select.Root
					type="single"
					value={activeSort}
					onValueChange={(value) => handleSortChange(value as VideoSort)}
				>
					<Select.Trigger class="w-[120px]">
						<span class="flex items-center gap-2">
							<selectedSortOption.icon />
							{selectedSortOption.label}
						</span>
					</Select.Trigger>
					<Select.Content>
						<Select.Group>
							<Select.Label>Sort by</Select.Label>
							{#each sortOptions as option (option.value)}
								<Select.Item value={option.value} label={option.label}>
									<option.icon />
									{option.label}
								</Select.Item>
							{/each}
						</Select.Group>
					</Select.Content>
				</Select.Root>
			</div>
		</div>

		<div
			bind:this={videoGridElement}
			class="grid gap-4 sm:gap-5"
			style:grid-template-columns={videoGridTemplate}
		>
			{#each videos as video, index (video.ytVideoId)}
				{@const formattedDuration = formatVideoDuration(video.duration)}
				{@const channelName = channel?.ytName ?? video.channelName}
				{@const channelThumbnail = channel?.ytAvatarUrl ?? video.channelAvatarUrl}
				{@const channelHandle = channel?.ytHandle ?? video.channelHandle}
				{@const shouldLazyLoad = index >= videoColumnCount * rowsVisibleOnLoad}

				<div class="group relative">
					<Card.Root
						class="flex h-full flex-col p-0 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
					>
						<a
							href={`https://www.youtube.com/watch?v=${video.ytVideoId}`}
							target="_blank"
							class="absolute inset-0 z-10"
							aria-label={video.title}
						></a>
						<Card.Content class="flex h-full flex-col p-0">
							<div>
								<AspectRatio ratio={16 / 9} class="relative overflow-hidden rounded-t-xl bg-muted">
									<img
										src={video.thumbnailUrl}
										alt={video.title}
										sizes={videoSizes}
										fetchpriority={!channel && index === 0
											? 'high'
											: shouldLazyLoad
												? 'low'
												: 'auto'}
										loading={shouldLazyLoad ? 'lazy' : 'eager'}
										decoding={shouldLazyLoad ? 'async' : 'sync'}
										class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
									/>
									<span
										class="absolute right-2 bottom-2 rounded bg-black/80 px-1.5 py-0.5 text-[11px] font-semibold text-white"
									>
										{#if video.livestreamType === 'live'}
											<div class="flex items-center gap-1">
												<CircleIcon class="size-2.5! fill-destructive text-destructive" />
												Live
											</div>
										{:else if video.livestreamType === 'upcoming'}
											Upcoming
										{:else if formattedDuration}
											{formattedDuration}
										{/if}
									</span>
								</AspectRatio>
							</div>

							<div class="flex flex-1 flex-col gap-3 p-4">
								<div>
									<h3
										class="line-clamp-2 leading-snug font-semibold transition-colors group-hover:text-primary"
									>
										{@html video.title}
									</h3>
								</div>

								{#if !channel}
									<div class="relative z-20 flex items-center gap-2">
										{#if channelName && channelHandle && channelThumbnail}
											<a
												href="/{channelHandle}"
												class="group/channel flex items-center gap-2 text-muted-foreground hover:text-foreground"
											>
												<Avatar class="h-6 w-6 shrink-0">
													<AvatarImage src={channelThumbnail} alt={channelName} />
													<AvatarFallback>{channelName.slice(0, 2).toUpperCase()}</AvatarFallback>
												</Avatar>
												<span class="truncate text-xs font-medium group-hover/channel:underline">
													{channelName}
												</span>
											</a>
										{/if}
									</div>
								{/if}

								<div class="text-muted-foreground">
									<div class="flex flex-col gap-2 text-xs">
										{#if video.livestreamType === 'live'}
											<div class="flex items-center gap-3">
												{#if video.livestreamConcurrentViewers}
													<span class="flex items-center gap-1">
														<Eye class="h-3 w-3" />
														{formatCompactNumber(video.livestreamConcurrentViewers)}
													</span>
												{/if}
												<span class="flex items-center gap-1">
													<ThumbsUp class="h-3 w-3" />
													{formatCompactNumber(video.likeCount)}
												</span>
												{#if video.livestreamActualStartTime}
													<span class="flex items-center gap-1">
														<Clock class="h-3 w-3" />
														{formatRelativeTime(video.livestreamActualStartTime)}
													</span>
												{/if}
											</div>
										{:else if video.livestreamType === 'upcoming'}
											<div class="flex items-center gap-3">
												<span class="flex items-center gap-1">
													<ThumbsUp class="h-3 w-3" />
													{formatCompactNumber(video.likeCount)}
												</span>
												{#if video.livestreamScheduledStartTime}
													<span class="flex items-center gap-1">
														<Calendar class="h-3 w-3" />
														Starting {formatDate(video.livestreamScheduledStartTime, true)}
													</span>
												{/if}
											</div>
										{:else}
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
											<div class="flex items-center gap-3">
												<span class="flex items-center gap-1">
													<Clock class="h-3 w-3" />
													{formatRelativeTime(video.publishedAt)}
												</span>
												<span class="flex items-center gap-1">
													<Calendar class="h-3 w-3" />
													{formatDate(video.publishedAt)}
												</span>
											</div>
										{/if}
									</div>
								</div>
							</div>
						</Card.Content>
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
