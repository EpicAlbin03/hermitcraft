<script lang="ts">
	import { AspectRatio } from '$lib/components/ui/aspect-ratio';
	import * as Card from '$lib/components/ui/card';
	import { Avatar, AvatarFallback, AvatarImage } from '$lib/components/ui/avatar';
	import { Eye, ThumbsUp, MessageCircle, Calendar, Clock, CircleIcon } from '@lucide/svelte';
	import {
		formatCompactNumber,
		formatDate,
		formatRelativeTime,
		formatVideoDuration
	} from '$lib/format';
	import type { CreatorDetails } from '$lib/remote/creators.remote';
	import type { VideoFeedItem } from './remote';

	type Props = {
		video: VideoFeedItem;
		creator?: CreatorDetails;
		index: number;
		videoSizes: string;
		videoColumnCount: number;
		rowsVisibleOnLoad: number;
	};

	const { video, creator, index, videoSizes, videoColumnCount, rowsVisibleOnLoad }: Props =
		$props();

	const formattedDuration = $derived(formatVideoDuration(video.duration ?? 0));
	const creatorName = $derived(creator?.ytName ?? video.creatorName);
	const creatorThumbnail = $derived(creator?.ytAvatarUrl ?? video.creatorAvatarUrl);
	const creatorHandle = $derived(creator?.ytHandle ?? video.creatorHandle);
	const shouldLazyLoad = $derived(index >= videoColumnCount * rowsVisibleOnLoad);
</script>

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
						fetchpriority={!creator && index === 0 ? 'high' : shouldLazyLoad ? 'low' : 'auto'}
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

				{#if !creator}
					<div class="relative z-20 flex items-center gap-2">
						{#if creatorName && creatorHandle && creatorThumbnail}
							<a
								href="/{creatorHandle}"
								data-sveltekit-preload-data="false"
								class="group/creator flex items-center gap-2 text-muted-foreground hover:text-foreground"
							>
								<Avatar class="h-6 w-6 shrink-0">
									<AvatarImage src={creatorThumbnail} alt={creatorName} />
									<AvatarFallback>{creatorName.slice(0, 2).toUpperCase()}</AvatarFallback>
								</Avatar>
								<span class="truncate text-xs font-medium group-hover/creator:underline">
									{creatorName}
								</span>
							</a>
						{/if}
					</div>
				{/if}

				<div class="text-muted-foreground">
					<div class="flex flex-col gap-2 text-xs">
						{#if video.livestreamType === 'live'}
							<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
								{#if video.livestreamConcurrentViewers}
									<span class="flex items-center gap-1 whitespace-nowrap">
										<Eye class="h-3 w-3" />
										<span class="font-semibold"
											>{formatCompactNumber(video.livestreamConcurrentViewers)}</span
										>
										Views
									</span>
								{/if}
								<span class="flex items-center gap-1 whitespace-nowrap">
									<ThumbsUp class="h-3 w-3" />
									<span class="font-semibold">{formatCompactNumber(video.likeCount)}</span>
									Likes
								</span>
								{#if video.livestreamActualStartTime}
									<span class="flex items-center gap-1">
										<Clock class="h-3 w-3" />
										{formatRelativeTime(video.livestreamActualStartTime)}
									</span>
								{/if}
							</div>
						{:else if video.livestreamType === 'upcoming'}
							<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
								<span class="flex items-center gap-1 whitespace-nowrap">
									<ThumbsUp class="h-3 w-3" />
									<span class="font-semibold">{formatCompactNumber(video.likeCount)}</span>
									Likes
								</span>
								{#if video.livestreamScheduledStartTime}
									<span class="flex items-center gap-1">
										<Calendar class="h-3 w-3" />
										Starting {formatDate(video.livestreamScheduledStartTime, true)}
									</span>
								{/if}
							</div>
						{:else}
							<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
								<span class="flex items-center gap-1 whitespace-nowrap">
									<Eye class="h-3 w-3" />
									<span class="font-semibold">{formatCompactNumber(video.viewCount)}</span>
									Views
								</span>
								<span class="flex items-center gap-1 whitespace-nowrap">
									<ThumbsUp class="h-3 w-3" />
									<span class="font-semibold">{formatCompactNumber(video.likeCount)}</span>
									Likes
								</span>
								<span class="flex items-center gap-1 whitespace-nowrap">
									<MessageCircle class="h-3 w-3" />
									<span class="font-semibold">{formatCompactNumber(video.commentCount)}</span>
									Comments
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
