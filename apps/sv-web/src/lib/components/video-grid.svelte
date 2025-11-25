<script lang="ts">
	import { useResizeObserver } from 'runed';
	import { AspectRatio } from '$lib/components/ui/aspect-ratio';
	import * as Card from '$lib/components/ui/card';
	import { IsTailwindBreakpoint } from '$lib/hooks/is-tailwind-breakpoint.svelte';
	import { useSidebarSpace } from '$lib/hooks/use-sidebar-space.svelte';
	import { Eye, ThumbsUp, MessageCircle, Calendar } from '@lucide/svelte';
	import type { ChannelVideos } from '$lib/remote/channels.remote';
	import { formatCompactNumber } from '$lib/format-number';

	type Props = {
		videos: ChannelVideos;
	};

	const { videos }: Props = $props();

	const VIDEO_CARD_MIN_WIDTH = 260;
	const VIDEO_CARD_MAX_WIDTH = 420;
	const VIDEO_CARD_MAX_COLUMNS = 6;

	let videoGridElement = $state<HTMLElement | null>(null);
	let videoGridWidth = $state(0);
	let videoGridGap = $state(16);

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
</script>

<div>
	<h2 class="mb-4 text-xl font-semibold">Recent Videos</h2>
	<div
		bind:this={videoGridElement}
		class="grid gap-4 sm:gap-5"
		style:grid-template-columns={videoGridTemplate}
	>
		{#each videos as video}
			<div class="group cursor-pointer">
				<Card.Root
					class="flex h-full flex-col p-0 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
				>
					<a href={`https://www.youtube.com/watch?v=/${video.ytVideoId}`} target="_blank">
						<Card.Content class="flex h-full flex-col p-0">
							<AspectRatio ratio={16 / 9} class="overflow-hidden rounded-t-xl bg-muted">
								<img
									src={video.thumbnailUrl}
									alt={video.title}
									sizes={videoSizes}
									loading="lazy"
									decoding="async"
									class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
								/>
							</AspectRatio>
							<div class="flex flex-1 flex-col gap-2 p-4">
								<h3
									class="line-clamp-2 leading-snug font-semibold transition-colors group-hover:text-primary"
								>
									{video.title}
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
										{new Date(video.publishedAt).toLocaleDateString()}
									</span>
								</div>
							</div>
						</Card.Content>
					</a>
				</Card.Root>
			</div>
		{/each}
	</div>
</div>
