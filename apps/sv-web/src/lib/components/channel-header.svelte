<script lang="ts">
	import { Eye, Users, Video, ChevronDown, ChevronUp, CircleIcon } from '@lucide/svelte';
	import * as Avatar from '$lib/components/ui/avatar';
	import { AspectRatio } from '$lib/components/ui/aspect-ratio';
	import { Button } from '$lib/components/ui/button';
	import {
		IsTailwindBreakpoint,
		type ActiveTailwindBreakpoint
	} from '$lib/hooks/is-tailwind-breakpoint.svelte';
	import { useSidebarSpace } from '$lib/hooks/use-sidebar-space.svelte';
	import { formatCompactNumber, parseChannelDescription } from '$lib/format';
	import { cn } from '$lib/utils';
	import type { ChannelDetails } from '$lib/remote/channels.remote';
	import { Image } from '@unpic/svelte';
	import { TwitchSVG, YoutubeSVG } from '$lib/assets/svg';

	type Props = {
		channel: ChannelDetails;
		handle: string;
	};

	const { channel, handle }: Props = $props();

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

	let isDescriptionExpanded = $state(false);
	const isTailwindBreakpoint = $derived(new IsTailwindBreakpoint().current);
	const sidebarSpace = useSidebarSpace(() => isTailwindBreakpoint);
	const contentWidthResolved = $derived(sidebarSpace.contentWidthResolved);

	const bannerRatio = $derived(BANNER_RATIOS[isTailwindBreakpoint] ?? BANNER_RATIOS.xs);
	const bannerSrc = $derived(
		channel.ytBannerUrl
			? `${channel.ytBannerUrl}=w${BANNER_WIDTHS[isTailwindBreakpoint] ?? BANNER_WIDTHS.xs}`
			: null
	);
	const bannerSizes = $derived(
		[
			`(min-width: 1536px) ${contentWidthResolved}`,
			`(min-width: 1024px) ${contentWidthResolved}`,
			`(min-width: 640px) ${contentWidthResolved}`,
			'100vw'
		].join(', ')
	);
	const bannerWidth = $derived(BANNER_WIDTHS[isTailwindBreakpoint] ?? BANNER_WIDTHS.xs);
	const bannerHeight = $derived(Math.round(bannerWidth / bannerRatio));
</script>

<div class="w-full rounded-xl bg-card pb-4 shadow-sm md:pb-6">
	{#if bannerSrc}
		<div class="w-full overflow-hidden rounded-t-xl">
			<AspectRatio ratio={bannerRatio} class="bg-muted">
				<Image
					src={bannerSrc}
					layout="fullWidth"
					width={bannerWidth}
					height={bannerHeight}
					breakpoints={BANNER_SRCSET_WIDTHS}
					sizes={bannerSizes}
					priority
					alt={`${channel.ytName} channel banner`}
					class="h-full w-full object-cover"
				/>
			</AspectRatio>
		</div>
	{/if}

	<div class="relative flex flex-col items-start gap-2 px-4 md:flex-row md:gap-6 md:px-6">
		<div class="relative z-10 -mt-12 shrink-0 md:mt-6">
			<Avatar.Root class="h-24 w-24 border-4 border-card text-3xl shadow-sm md:h-32 md:w-32">
				{#snippet child({ props })}
					<a {...props} href={`https://www.youtube.com/${handle}`} target="_blank">
						<Avatar.Image src={channel.ytAvatarUrl} alt={channel.ytName} />
						<Avatar.Fallback>{channel.ytName.slice(0, 2).toUpperCase()}</Avatar.Fallback>
					</a>
				{/snippet}
			</Avatar.Root>
		</div>

		<div class="mt-2 flex flex-1 flex-col gap-2 md:mt-4">
			<div>
				<div class="flex items-center gap-2">
					<Button
						variant="link"
						class="p-0 text-2xl font-bold md:text-3xl"
						href={`https://www.youtube.com/${handle}`}
						target="_blank"
					>
						{channel.ytName}
					</Button>
					<div class="flex items-center">
						{#if channel.ytLiveVideoId}
							<Button
								variant="ghost"
								size="sm"
								href={`https://www.youtube.com/watch?v=${channel.ytLiveVideoId}`}
								target="_blank"
								class="text-sm font-semibold"
							>
								<YoutubeSVG class="h-4 w-4" />
								Live
							</Button>
						{/if}
						{#if channel.isTwitchLive}
							<Button
								variant="ghost"
								size="sm"
								href={`https://www.twitch.tv/${channel.twitchUserLogin}`}
								target="_blank"
								class="text-sm font-semibold"
							>
								<TwitchSVG class="h-4 w-4" />
								Live
							</Button>
						{/if}
					</div>
				</div>
				<p class="text-muted-foreground">{handle}</p>
			</div>

			<div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
				<span class="flex items-center gap-1">
					<Users class="h-4 w-4" />
					{formatCompactNumber(channel.ytSubscriberCount)} subscribers
				</span>
				<span class="flex items-center gap-1">
					<Video class="h-4 w-4" />
					{formatCompactNumber(channel.ytVideoCount)} videos
				</span>
				<span class="flex items-center gap-1">
					<Eye class="h-4 w-4" />
					{formatCompactNumber(channel.ytViewCount)} views
				</span>
			</div>

			<div class="mt-2 max-w-3xl">
				<p
					class={cn(
						'text-sm whitespace-pre-wrap',
						!isDescriptionExpanded && 'line-clamp-1 lg:line-clamp-2'
					)}
				>
					{#each parseChannelDescription(channel.ytDescription) as part}
						{#if part.type === 'link'}
							<Button class="p-0" variant="link" size="sm" href={part.content} target="_blank">
								{part.content}
							</Button>
						{:else}
							{@html part.content}
						{/if}
					{/each}
				</p>
				{#if channel.ytDescription.length > 150}
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
