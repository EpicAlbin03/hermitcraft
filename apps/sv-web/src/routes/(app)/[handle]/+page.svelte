<script lang="ts">
	import { page } from '$app/state';
	import {
		remoteGetChannelDetails,
		remoteGetChannelVideos,
		type ChannelDetails,
		type ChannelVideos
	} from '$lib/remote/channels.remote';
	import * as Avatar from '$lib/components/ui/avatar';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { AspectRatio } from '$lib/components/ui/aspect-ratio';
	import { SIDEBAR_WIDTH } from '$lib/components/ui/sidebar/constants';
	import {
		Eye,
		Users,
		Video,
		MessageCircle,
		ThumbsUp,
		Calendar,
		ChevronDown,
		ChevronUp
	} from '@lucide/svelte';
	import { cn } from '$lib/utils';
	import {
		IsTailwindBreakpoint,
		type ActiveTailwindBreakpoint
	} from '$lib/hooks/is-tailwind-breakpoint.svelte';
	import { useSidebar } from '$lib/components/ui/sidebar';
	import { useResizeObserver } from 'runed';

	const handle = $derived(page.params.handle as string);
	const channel = $derived<ChannelDetails>(await remoteGetChannelDetails(handle));
	const videos = $derived<ChannelVideos>(await remoteGetChannelVideos(channel.ytChannelId));

	let isDescriptionExpanded = $state(false);
	const sidebar = useSidebar();
	const isSidebarOpen = $derived(sidebar.open);

	const isTailwindBreakpoint = $derived(new IsTailwindBreakpoint().current);

	const DESKTOP_BREAKPOINTS: ActiveTailwindBreakpoint[] = ['md', 'lg', 'xl', '2xl'];

	const BANNER_RATIOS: Record<ActiveTailwindBreakpoint, number> = {
		xs: 2,
		sm: 5 / 2,
		md: 8 / 3,
		lg: 4,
		xl: 5,
		'2xl': 7
	};

	const BANNER_WIDTHS: Record<ActiveTailwindBreakpoint, number> = {
		xs: 960,
		sm: 1280,
		md: 1600,
		lg: 1920,
		xl: 2120,
		'2xl': 2560
	};

	const BANNER_SRCSET_WIDTHS = [960, 1280, 1600, 1920, 2120, 2560] as const;

	const bannerRatio = $derived(BANNER_RATIOS[isTailwindBreakpoint] ?? BANNER_RATIOS.xs);
	const bannerSrc = $derived(
		`${channel.bannerUrl}=w${BANNER_WIDTHS[isTailwindBreakpoint] ?? BANNER_WIDTHS.xs}`
	);
	const bannerSrcSet = $derived(
		BANNER_SRCSET_WIDTHS.map((width) => `${channel.bannerUrl}=w${width} ${width}w`).join(', ')
	);

	const shouldReserveSidebarSpace = $derived(
		DESKTOP_BREAKPOINTS.includes(isTailwindBreakpoint) && isSidebarOpen
	);
	const contentWidthRaw = $derived(
		shouldReserveSidebarSpace ? `(100vw - ${SIDEBAR_WIDTH})` : '100vw'
	);
	const contentWidthResolved = $derived(
		shouldReserveSidebarSpace ? `calc(${contentWidthRaw})` : contentWidthRaw
	);

	const bannerSizes = $derived(
		[
			`(min-width: 1536px) ${contentWidthResolved}`,
			`(min-width: 1024px) ${contentWidthResolved}`,
			`(min-width: 640px) ${contentWidthResolved}`,
			'100vw'
		].join(', ')
	);

	const VIDEO_CARD_MIN_WIDTH = 260;
	const VIDEO_CARD_MAX_WIDTH = 420;
	const VIDEO_CARD_MAX_COLUMNS = 6;
	let videoGridElement = $state<HTMLElement | null>(null);
	let videoGridWidth = $state(0);
	let videoGridGap = $state(16);

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

	function formatNumber(num: number) {
		return new Intl.NumberFormat('en-US', {
			notation: 'compact',
			maximumFractionDigits: 1
		}).format(num);
	}
</script>

<div class="w-full rounded-xl bg-card pb-4 shadow-sm md:pb-6">
	<div class="w-full overflow-hidden rounded-t-xl">
		<AspectRatio ratio={bannerRatio} class="bg-muted">
			<img
				src={bannerSrc}
				srcset={bannerSrcSet}
				sizes={bannerSizes}
				alt={`${channel.name} channel banner`}
				class="h-full w-full object-cover"
				loading="eager"
				fetchpriority="high"
				decoding="async"
			/>
		</AspectRatio>
	</div>

	<div class="relative flex flex-col items-start gap-2 px-4 md:flex-row md:gap-6 md:px-6">
		<div class="relative z-10 -mt-12 shrink-0 md:mt-6">
			<Avatar.Root class="h-24 w-24 border-4 border-card text-3xl shadow-sm md:h-32 md:w-32">
				<Avatar.Image src={channel.thumbnailUrl} alt={channel.name} />
				<Avatar.Fallback>{channel.name.slice(0, 2).toUpperCase()}</Avatar.Fallback>
			</Avatar.Root>
		</div>

		<div class="mt-2 flex flex-1 flex-col gap-2 md:mt-4">
			<div>
				<h1 class="text-2xl font-bold md:text-3xl">{channel.name}</h1>
				<p class="text-muted-foreground">{handle}</p>
			</div>

			<div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
				<span class="flex items-center gap-1">
					<Users class="h-4 w-4" />
					{formatNumber(channel.subscriberCount)} subscribers
				</span>
				<span class="flex items-center gap-1">
					<Video class="h-4 w-4" />
					{formatNumber(channel.videoCount)} videos
				</span>
				<span class="flex items-center gap-1">
					<Eye class="h-4 w-4" />
					{formatNumber(channel.viewCount)} views
				</span>
			</div>

			<div class="mt-2 max-w-3xl">
				<p
					class={cn(
						'text-sm whitespace-pre-wrap',
						!isDescriptionExpanded && 'line-clamp-1 lg:line-clamp-2'
					)}
				>
					{channel.description}
				</p>
				{#if channel.description.length > 150}
					<Button
						variant="ghost"
						size="sm"
						class="mt-0 h-auto p-0 text-xs text-muted-foreground hover:bg-transparent hover:text-primary"
						onclick={() => (isDescriptionExpanded = !isDescriptionExpanded)}
					>
						<span class="flex items-center gap-1 pt-1">
							{isDescriptionExpanded ? 'Show less' : 'Show more'}
							{#if isDescriptionExpanded}
								<ChevronUp class="h-3 w-3" />
							{:else}
								<ChevronDown class="h-3 w-3" />
							{/if}
						</span>
					</Button>
				{/if}
			</div>
		</div>
	</div>
</div>

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
										{formatNumber(video.viewCount)}
									</span>
									<span class="flex items-center gap-1">
										<ThumbsUp class="h-3 w-3" />
										{formatNumber(video.likeCount)}
									</span>
									<span class="flex items-center gap-1">
										<MessageCircle class="h-3 w-3" />
										{formatNumber(video.commentCount)}
									</span>
								</div>
								<span class="flex items-center gap-1">
									<Calendar class="h-3 w-3" />
									{new Date(video.publishedAt).toLocaleDateString()}
								</span>
							</div>
						</div>
					</Card.Content>
				</Card.Root>
			</div>
		{/each}
	</div>
</div>
