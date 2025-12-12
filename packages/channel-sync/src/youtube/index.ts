import { google, youtube_v3 } from 'googleapis';
import { Console, Effect } from 'effect';
import { TaggedError } from 'effect/Data';
import { getYtPlaylistId, getVideoLivestreamType, parseYtRSS } from './utils';
import type { Video } from '@hc/db';
class YoutubeError extends TaggedError('YoutubeError') {
	constructor(message: string, options?: { cause?: unknown }) {
		super();
		this.message = message;
		this.cause = options?.cause;
	}
}

const youtubeService = Effect.gen(function* () {
	const youtubeApiKey = yield* Effect.sync(() => Bun.env.YT_API_KEY);

	if (!youtubeApiKey) {
		return yield* Effect.die('YT_API_KEY is not set');
	}

	const youtube = google.youtube({
		version: 'v3',
		auth: youtubeApiKey
	});

	const getChannelDetails = (ytChannelId: string) =>
		Effect.gen(function* () {
			const response = yield* Effect.tryPromise({
				try: () =>
					youtube.channels.list({
						part: ['id', 'snippet', 'statistics', 'brandingSettings'],
						id: [ytChannelId]
					}),
				catch: (err) =>
					new YoutubeError(`Failed to get details for channel ${ytChannelId}`, {
						cause: err
					})
			});

			const item = response.data.items?.[0];
			if (!item || !item.id || !item.snippet) {
				return yield* Effect.fail(new YoutubeError(`Channel ${ytChannelId} not found`));
			}

			const thumbnail =
				item.snippet.thumbnails?.maxres ||
				item.snippet.thumbnails?.standard ||
				item.snippet.thumbnails?.high ||
				item.snippet.thumbnails?.medium ||
				item.snippet.thumbnails?.default;

			return {
				ytChannelId: item.id,
				ytName: item.snippet.title || '',
				ytHandle: item.snippet.customUrl || '',
				ytDescription: item.snippet.description || '',
				ytAvatarUrl: thumbnail?.url || '',
				ytBannerUrl: item.brandingSettings?.image?.bannerExternalUrl || '',
				ytViewCount: parseInt(item.statistics?.viewCount || '0', 10),
				ytSubscriberCount: parseInt(item.statistics?.subscriberCount || '0', 10),
				ytVideoCount: parseInt(item.statistics?.videoCount || '0', 10),
				ytJoinedAt: new Date(item.snippet.publishedAt || 0)
			};
		});

	const setVideoDetails = (item: youtube_v3.Schema$Video | undefined, ytVideoId: string) =>
		Effect.gen(function* () {
			if (!item || !item.id || !item.snippet || !item.snippet.channelId) {
				return yield* Effect.fail(new YoutubeError(`Video ${ytVideoId} not found`));
			}

			const thumbnail =
				item.snippet.thumbnails?.maxres ||
				item.snippet.thumbnails?.standard ||
				item.snippet.thumbnails?.high ||
				item.snippet.thumbnails?.medium ||
				item.snippet.thumbnails?.default;

			const hasBeenLivestream = item.liveStreamingDetails ? true : false;
			const liveBroadcastContent =
				(item.snippet.liveBroadcastContent as Exclude<Video['livestreamType'], 'completed'>) ||
				'none';

			return {
				ytVideoId: item.id,
				ytChannelId: item.snippet.channelId,
				title: item.snippet.title || '',
				thumbnailUrl: thumbnail?.url || '',
				publishedAt: new Date(item.snippet.publishedAt || 0),
				viewCount: parseInt(item.statistics?.viewCount || '0', 10),
				likeCount: parseInt(item.statistics?.likeCount || '0', 10),
				commentCount: parseInt(item.statistics?.commentCount || '0', 10),
				duration: item.contentDetails?.duration || '',
				livestreamType: getVideoLivestreamType(liveBroadcastContent, hasBeenLivestream),
				livestreamScheduledStartTime: item.liveStreamingDetails?.scheduledStartTime
					? new Date(item.liveStreamingDetails.scheduledStartTime)
					: null,
				livestreamActualStartTime: item.liveStreamingDetails?.actualStartTime
					? new Date(item.liveStreamingDetails.actualStartTime)
					: null,
				livestreamConcurrentViewers: parseInt(
					item.liveStreamingDetails?.concurrentViewers || '0',
					10
				)
			};
		});

	const getVideoDetails = (ytVideoId: string) =>
		Effect.gen(function* () {
			const response = yield* Effect.tryPromise({
				try: () =>
					youtube.videos.list({
						part: ['snippet', 'statistics', 'contentDetails', 'liveStreamingDetails'],
						id: [ytVideoId]
					}),
				catch: (err) =>
					new YoutubeError(`Failed to get details for video ${ytVideoId}`, { cause: err })
			});

			const item = response.data.items?.[0];
			const videoDetails = yield* setVideoDetails(item, ytVideoId);
			return videoDetails;
		});

	const getBatchVideoDetails = (ytVideoIds: string[]) =>
		Effect.gen(function* () {
			if (ytVideoIds.length > 50) {
				return yield* Effect.fail(new YoutubeError('Maximum of 50 videos can be fetched at once'));
			}

			const response = yield* Effect.tryPromise({
				try: () =>
					youtube.videos.list({
						part: ['snippet', 'statistics', 'contentDetails', 'liveStreamingDetails'],
						id: ytVideoIds
					}),
				catch: (err) =>
					new YoutubeError(`Failed to get batch video details for ${ytVideoIds}`, {
						cause: err
					})
			});

			const videoDetailsMap = new Map<string, Omit<Video, 'isShort'>>();
			const items = response.data.items ?? [];

			yield* Effect.forEach(
				items,
				(item) =>
					Effect.gen(function* () {
						if (!item || !item.id) return;
						const result = yield* Effect.either(setVideoDetails(item, item.id));
						if (result._tag === 'Right') {
							videoDetailsMap.set(item.id, result.right);
						}
					}),
				{ concurrency: 'unbounded' }
			);

			return videoDetailsMap;
		});

	const getVideoIdsFromUploadsPlaylist = (ytChannelId: string, maxResults?: number) =>
		Effect.gen(function* () {
			const playlists = yield* Effect.tryPromise({
				try: () =>
					youtube.channels.list({
						part: ['contentDetails'],
						id: [ytChannelId]
					}),
				catch: (err) =>
					new YoutubeError(`Failed to get playlists for channel ${ytChannelId}`, {
						cause: err
					})
			});

			const uploadsPlaylistId =
				playlists.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;

			if (!uploadsPlaylistId) {
				return yield* Effect.fail(
					new YoutubeError(`Could not find uploads playlist for channel ${ytChannelId}`)
				);
			}

			yield* Console.log(`Uploads playlist ID: ${uploadsPlaylistId}`);

			let videoIds: string[] = [];
			let nextPageToken: string | undefined;

			do {
				const playlistResponse = yield* Effect.tryPromise({
					try: () =>
						youtube.playlistItems.list({
							part: ['contentDetails'],
							playlistId: uploadsPlaylistId,
							maxResults: 50,
							...(nextPageToken !== undefined && { pageToken: nextPageToken })
						}),
					catch: (err) =>
						new YoutubeError(`Failed to get playlist items for playlist ${uploadsPlaylistId}`, {
							cause: err
						})
				});

				const items = playlistResponse.data.items || [];
				for (const item of items) {
					if (item.contentDetails?.videoId) {
						videoIds.push(item.contentDetails.videoId);
					}
				}
				nextPageToken = playlistResponse.data.nextPageToken || undefined;
			} while (nextPageToken && (maxResults === undefined || videoIds.length < maxResults));

			// Remove first 15 videos to not conflict with RSS feed / videoSyncProgram
			return videoIds.slice(15);
		});

	const getRSSVideoIds = (ytChannelId: string) =>
		Effect.gen(function* () {
			// Latest 15 videos
			const response = yield* Effect.tryPromise({
				try: () => fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${ytChannelId}`),
				catch: (err) => new YoutubeError(`Failed to fetch RSS for channel`, { cause: err })
			});

			if (!response.ok) {
				return yield* Effect.fail(
					new YoutubeError(`Failed to fetch RSS for channel ${ytChannelId}`)
				);
			}

			const xml = yield* Effect.tryPromise({
				try: () => response.text(),
				catch: (err) => new YoutubeError(`Failed to read RSS text`, { cause: err })
			});

			return parseYtRSS(xml);
		});

	const isVideoShort = (ytVideoId: string, ytChannelId: string) =>
		Effect.gen(function* () {
			const shortsPlaylistId = getYtPlaylistId(ytChannelId, 'shorts');
			if (!shortsPlaylistId) return false;

			const response = yield* Effect.tryPromise({
				try: () =>
					youtube.playlistItems.list({
						part: ['id'],
						playlistId: shortsPlaylistId,
						videoId: ytVideoId,
						maxResults: 1
					}),
				catch: (err) =>
					new YoutubeError(`Failed to check if video ${ytVideoId} is a short`, {
						cause: err
					})
			});

			return (response.data.items?.length ?? 0) > 0;
		});

	const areVideosShorts = (ytVideoIds: string[], ytChannelId: string, maxResults?: number) =>
		Effect.gen(function* () {
			const shortsPlaylistId = getYtPlaylistId(ytChannelId, 'shorts');
			if (!shortsPlaylistId) return new Map<string, boolean>();

			const shortsSet = new Set<string>();
			let nextPageToken: string | undefined;

			do {
				const playlistResponse = yield* Effect.tryPromise({
					try: () =>
						youtube.playlistItems.list({
							part: ['contentDetails'],
							playlistId: shortsPlaylistId,
							maxResults: 50,
							...(nextPageToken !== undefined && { pageToken: nextPageToken })
						}),
					catch: (err) =>
						new YoutubeError(`Failed to fetch shorts playlist for ${ytChannelId}`, {
							cause: err
						})
				});

				for (const item of playlistResponse.data.items || []) {
					if (item.contentDetails?.videoId) {
						shortsSet.add(item.contentDetails.videoId);
					}
				}
				nextPageToken = playlistResponse.data.nextPageToken || undefined;
			} while (nextPageToken && (maxResults === undefined || shortsSet.size < maxResults));

			const result = new Map<string, boolean>();
			for (const videoId of ytVideoIds) {
				result.set(videoId, shortsSet.has(videoId));
			}
			return result;
		});

	return {
		getChannelDetails,
		getVideoDetails,
		getBatchVideoDetails,
		getVideoIdsFromUploadsPlaylist,
		getRSSVideoIds,
		isVideoShort,
		areVideosShorts
	};
});

export class YoutubeService extends Effect.Service<YoutubeService>()('YoutubeService', {
	effect: youtubeService
}) {}
