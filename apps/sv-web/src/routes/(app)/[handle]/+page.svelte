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
	import {
		Eye,
		Users,
		Video,
		MessageCircle,
		Heart,
		Calendar,
		ChevronDown,
		ChevronUp
	} from '@lucide/svelte';
	import { cn } from '$lib/utils';
	import { IsTailwindBreakpoint } from '$lib/hooks/is-tailwind-breakpoint.svelte';

	const handle = $derived(page.params.handle as string);
	const channel = $derived<ChannelDetails>(await remoteGetChannelDetails(handle));
	const videos = $derived<ChannelVideos>(await remoteGetChannelVideos(channel.ytChannelId));

	let isDescriptionExpanded = $state(false);

	const isTailwindBreakpoint = $derived(new IsTailwindBreakpoint().current);

	function formatNumber(num: number) {
		return new Intl.NumberFormat('en-US', {
			notation: 'compact',
			maximumFractionDigits: 1
		}).format(num);
	}
</script>

<div class="w-full rounded-xl bg-card pb-4 shadow-sm md:pb-6">
	<div class="w-full overflow-hidden rounded-t-xl">
		<AspectRatio ratio={isTailwindBreakpoint === '2xl' ? 8 / 1 : 6 / 1} class="bg-muted">
			<img
				src={channel.bannerUrl + '=w2120'}
				alt="Channel Banner"
				class="h-full w-full object-cover"
			/>
		</AspectRatio>
	</div>

	<div class="relative flex flex-col items-start gap-4 px-4 md:flex-row md:gap-6 md:px-6">
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

<div class="rounded-xl bg-card p-4 shadow-sm md:p-6">
	<h2 class="mb-4 text-xl font-semibold">Recent Videos</h2>
	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
		{#each videos as video}
			<div class="group cursor-pointer">
				<Card.Root class="h-full bg-background p-0 shadow-sm transition-all hover:shadow-md">
					<Card.Content class="p-0">
						<AspectRatio ratio={16 / 9} class="overflow-hidden rounded-t-xl bg-muted">
							<img
								src={video.thumbnailUrl}
								alt={video.title}
								class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
							/>
						</AspectRatio>
						<div class="flex flex-col gap-2 p-4">
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
										<Heart class="h-3 w-3" />
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
