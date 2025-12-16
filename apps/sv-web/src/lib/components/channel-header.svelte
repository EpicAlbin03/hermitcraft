<script lang="ts">
	import { Eye, Users, Video, ChevronDown, ChevronUp, Link as LinkIcon } from '@lucide/svelte';
	import * as Avatar from '$lib/components/ui/avatar';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { type ActiveTailwindBreakpoint } from '$lib/hooks/is-tailwind-breakpoint.svelte';
	import { formatCompactNumber, parseChannelDescription } from '$lib/format';
	import { cn } from '$lib/utils';
	import { getIconFromUrl } from '$lib/utils';
	import type { ChannelDetails } from '$lib/remote/channels.remote';
	import { YoutubeSVG, TwitchSVG } from '$lib/assets/svg';
	import ImageIcon from './image-icon.svelte';

	type Props = {
		channel: ChannelDetails;
		handle: string;
	};

	const { channel, handle }: Props = $props();

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

	const channelLinks = $derived.by(() => {
		const allLinks = [
			{ title: channel.ytName, url: `https://www.youtube.com/${handle}` },
			...(channel.links ?? [])
		];

		const youtubeLinks = allLinks.filter(
			(link) => link.url.includes('youtube.com') || link.url.includes('youtu.be')
		);
		const nonYoutubeLinks = allLinks.filter(
			(link) => !(link.url.includes('youtube.com') || link.url.includes('youtu.be'))
		);

		const twitchLink = channel.twitchUserLogin
			? [{ title: 'Twitch', url: `https://www.twitch.tv/${channel.twitchUserLogin}` }]
			: [];

		return [...youtubeLinks, ...twitchLink, ...nonYoutubeLinks];
	});

	// Use stable src for SSR hydration - srcset handles responsive loading
	const bannerSrc = $derived(
		channel.ytBannerUrl ? `${channel.ytBannerUrl}=w${BANNER_WIDTHS['2xl']}` : null
	);
	const bannerSrcset = $derived(
		channel.ytBannerUrl
			? BANNER_SRCSET_WIDTHS.map((w) => `${channel.ytBannerUrl}=w${w} ${w}w`).join(', ')
			: undefined
	);

	// Preload link values for early image fetching
	const preloadHref = $derived(channel.ytBannerUrl ? `${channel.ytBannerUrl}=w2560` : undefined);
	const preloadSrcset = $derived(
		channel.ytBannerUrl
			? BANNER_SRCSET_WIDTHS.map((w) => `${channel.ytBannerUrl}=w${w} ${w}w`).join(', ')
			: undefined
	);
</script>

<!-- Preload banner image so browser starts downloading immediately -->
<svelte:head>
	{#if preloadHref}
		<link
			rel="preload"
			as="image"
			href={preloadHref}
			imagesrcset={preloadSrcset}
			imagesizes="100vw"
			fetchpriority="high"
		/>
	{/if}
</svelte:head>

<div class="w-full rounded-xl bg-card pb-4 shadow-sm md:pb-6">
	{#if bannerSrc}
		<div
			class="aspect-2/1 w-full overflow-hidden rounded-t-xl bg-muted sm:aspect-5/2 md:aspect-8/3 lg:aspect-4/1 xl:aspect-5/1 2xl:aspect-7/1"
		>
			<img
				src={bannerSrc}
				srcset={bannerSrcset}
				sizes="100vw"
				fetchpriority="high"
				loading="eager"
				decoding="sync"
				alt={`${channel.ytName} channel banner`}
				class="h-full w-full object-cover"
			/>
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

			<div class="mt-2 max-w-xl">
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
				{#if channel.ytDescription.length > 175}
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

		<div class="absolute top-2 right-4 mt-2 flex max-w-md gap-2 md:static md:mt-6">
			<div class="hidden flex-wrap justify-end xl:flex">
				{#each channelLinks as link (link.url)}
					{@const Icon = getIconFromUrl(link.url, link.title)}
					<Button variant="ghost" size="sm" href={link.url} target="_blank">
						{#if typeof Icon === 'object' && 'url' in Icon && 'alt' in Icon}
							<ImageIcon url={Icon.url} alt={Icon.alt} fallback={Icon.fallback} class="h-4 w-4" />
						{:else}
							<Icon class="h-4 w-4" />
						{/if}
						{link.title}
					</Button>
				{/each}
			</div>

			<div class="xl:hidden">
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button {...props} variant="outline" size="sm">
								<LinkIcon class="h-4 w-4" />
								Links
							</Button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end">
						{#each channelLinks as link (link.url)}
							{@const Icon = getIconFromUrl(link.url, link.title)}
							<DropdownMenu.Item>
								{#snippet child({ props })}
									<a href={link.url} target="_blank" {...props}>
										{#if typeof Icon === 'object' && 'url' in Icon && 'alt' in Icon}
											<ImageIcon
												url={Icon.url}
												alt={Icon.alt}
												fallback={Icon.fallback}
												class="h-4 w-4"
											/>
										{:else}
											<Icon class="h-4 w-4" />
										{/if}
										{link.title}
									</a>
								{/snippet}
							</DropdownMenu.Item>
						{/each}
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			</div>
		</div>
	</div>
</div>
