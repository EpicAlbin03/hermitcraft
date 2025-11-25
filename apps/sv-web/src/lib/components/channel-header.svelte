<script lang="ts">
	import { Eye, Users, Video, ChevronDown, ChevronUp } from '@lucide/svelte';
	import * as Avatar from '$lib/components/ui/avatar';
	import { AspectRatio } from '$lib/components/ui/aspect-ratio';
	import { Button } from '$lib/components/ui/button';
	import {
		IsTailwindBreakpoint,
		type ActiveTailwindBreakpoint
	} from '$lib/hooks/is-tailwind-breakpoint.svelte';
	import { useSidebarSpace } from '$lib/hooks/use-sidebar-space.svelte';
	import { formatCompactNumber } from '$lib/format-number';
	import { cn } from '$lib/utils';
	import type { ChannelDetails } from '$lib/remote/channels.remote';

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
		`${channel.bannerUrl}=w${BANNER_WIDTHS[isTailwindBreakpoint] ?? BANNER_WIDTHS.xs}`
	);
	const bannerSrcSet = $derived(
		BANNER_SRCSET_WIDTHS.map((width) => `${channel.bannerUrl}=w${width} ${width}w`).join(', ')
	);

	const bannerSizes = $derived(
		[
			`(min-width: 1536px) ${contentWidthResolved}`,
			`(min-width: 1024px) ${contentWidthResolved}`,
			`(min-width: 640px) ${contentWidthResolved}`,
			'100vw'
		].join(', ')
	);
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
				{#snippet child({ props })}
					<a {...props} href={`https://www.youtube.com/${handle}`} target="_blank">
						<Avatar.Image src={channel.thumbnailUrl} alt={channel.name} />
						<Avatar.Fallback>{channel.name.slice(0, 2).toUpperCase()}</Avatar.Fallback>
					</a>
				{/snippet}
			</Avatar.Root>
		</div>

		<div class="mt-2 flex flex-1 flex-col gap-2 md:mt-4">
			<div>
				<Button
					variant="link"
					class="p-0 text-2xl font-bold md:text-3xl"
					href={`https://www.youtube.com/${handle}`}
					target="_blank"
				>
					{channel.name}
				</Button>
				<p class="text-muted-foreground">{handle}</p>
			</div>

			<div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
				<span class="flex items-center gap-1">
					<Users class="h-4 w-4" />
					{formatCompactNumber(channel.subscriberCount)} subscribers
				</span>
				<span class="flex items-center gap-1">
					<Video class="h-4 w-4" />
					{formatCompactNumber(channel.videoCount)} videos
				</span>
				<span class="flex items-center gap-1">
					<Eye class="h-4 w-4" />
					{formatCompactNumber(channel.viewCount)} views
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
