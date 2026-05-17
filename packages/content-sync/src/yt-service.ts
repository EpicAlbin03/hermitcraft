import type { Video } from '@hc/db/schema';
import { google, youtube_v3 } from 'googleapis';
import sharp from 'sharp';
import * as Context from 'effect/Context';
import * as Data from 'effect/Data';
import * as DateTime from 'effect/DateTime';
import * as Effect from 'effect/Effect';
import * as Schedule from 'effect/Schedule';
import { rgbaToThumbHash, thumbHashToDataURL } from 'thumbhash';
import { getYtPlaylistId, getVideoLivestreamType, parseYtRSS } from './utils';

class YoutubeError extends Data.TaggedError('YoutubeError')<{ message: string; cause?: unknown }> {}

const parseDate = (value: string | null | undefined) =>
	DateTime.toDate(DateTime.makeUnsafe(value ?? 0));

const getThumbnailUrl = (item: youtube_v3.Schema$Video | youtube_v3.Schema$Channel) => {
	const thumbnail =
		item.snippet?.thumbnails?.maxres ||
		item.snippet?.thumbnails?.standard ||
		item.snippet?.thumbnails?.high ||
		item.snippet?.thumbnails?.medium ||
		item.snippet?.thumbnails?.default;

	return thumbnail?.url || '';
};

const youtubeService = Effect.gen(function* () {
	const youtubeApiKey = Bun.env.YT_API_KEY;
	if (!youtubeApiKey) {
		return yield* Effect.die('YT_API_KEY is not set');
	}

	const youtube = google.youtube({
		version: 'v3',
		auth: youtubeApiKey
	});

	const generateBannerThumbHash = Effect.fn('generateBannerThumbHash')(function* (
		bannerUrl: string
	) {
		const res = yield* Effect.tryPromise({
			try: () => fetch(`${bannerUrl}=w100`),
			catch: (cause) => new YoutubeError({ message: 'Failed to fetch banner for thumbhash', cause })
		});
		const buffer = yield* Effect.tryPromise({
			try: () => res.arrayBuffer(),
			catch: (cause) => new YoutubeError({ message: 'Failed to read banner buffer', cause })
		});
		const { data, info } = yield* Effect.tryPromise({
			try: () =>
				sharp(new Uint8Array(buffer)).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
			catch: (cause) => new YoutubeError({ message: 'Failed to decode banner image', cause })
		});
		const hash = rgbaToThumbHash(info.width, info.height, data);
		return thumbHashToDataURL(hash);
	});

	const getChannelDetails = Effect.fn('getChannelDetails')(function* (ytChannelId: string) {
		const response = yield* Effect.tryPromise({
			try: () =>
				youtube.channels.list({
					part: ['id', 'snippet', 'statistics', 'brandingSettings'],
					id: [ytChannelId]
				}),
			catch: (cause) =>
				new YoutubeError({
					message: `Failed to get details for channel ${ytChannelId}`,
					cause
				})
		});

		const item = response.data.items?.[0];
		if (!item || !item.id || !item.snippet) {
			return yield* new YoutubeError({ message: `Channel ${ytChannelId} not found` });
		}

		const bannerUrl = item.brandingSettings?.image?.bannerExternalUrl || '';
		const ytBannerThumbHash = bannerUrl
			? yield* generateBannerThumbHash(bannerUrl).pipe(
					Effect.catch((err) =>
						Effect.logWarning(`Failed to generate thumbhash: ${err.message}`).pipe(Effect.as(null))
					)
				)
			: null;

		return {
			ytChannelId: item.id,
			ytName: item.snippet.title || '',
			ytHandle: item.snippet.customUrl || '',
			ytDescription: item.snippet.description || '',
			ytAvatarUrl: getThumbnailUrl(item),
			ytBannerUrl: bannerUrl,
			ytBannerThumbHash,
			ytViewCount: parseInt(item.statistics?.viewCount || '0', 10),
			ytSubscriberCount: parseInt(item.statistics?.subscriberCount || '0', 10),
			ytVideoCount: parseInt(item.statistics?.videoCount || '0', 10),
			ytJoinedAt: parseDate(item.snippet.publishedAt)
		};
	});

	const setVideoDetails = Effect.fn('setVideoDetails')(function* (
		item: youtube_v3.Schema$Video | undefined,
		ytVideoId: string
	) {
		if (!item || !item.id || !item.snippet || !item.snippet.channelId) {
			return yield* new YoutubeError({ message: `Video ${ytVideoId} not found` });
		}

		const hasBeenLivestream = item.liveStreamingDetails !== undefined;
		const liveBroadcastContent =
			(item.snippet.liveBroadcastContent as Exclude<Video['livestreamType'], 'completed'>) ||
			'none';

		return {
			ytVideoId: item.id,
			ytChannelId: item.snippet.channelId,
			title: item.snippet.title || '',
			thumbnailUrl: getThumbnailUrl(item),
			publishedAt: parseDate(item.snippet.publishedAt),
			privacyStatus: item.status?.privacyStatus || 'public',
			uploadStatus: item.status?.uploadStatus || 'uploaded',
			viewCount: parseInt(item.statistics?.viewCount || '0', 10),
			likeCount: parseInt(item.statistics?.likeCount || '0', 10),
			commentCount: parseInt(item.statistics?.commentCount || '0', 10),
			duration: item.contentDetails?.duration || '',
			livestreamType: getVideoLivestreamType(liveBroadcastContent, hasBeenLivestream),
			livestreamScheduledStartTime: item.liveStreamingDetails?.scheduledStartTime
				? parseDate(item.liveStreamingDetails.scheduledStartTime)
				: null,
			livestreamActualStartTime: item.liveStreamingDetails?.actualStartTime
				? parseDate(item.liveStreamingDetails.actualStartTime)
				: null,
			livestreamConcurrentViewers: parseInt(item.liveStreamingDetails?.concurrentViewers || '0', 10)
		} as Omit<Video, 'isShort'>;
	});

	const getVideoDetails = Effect.fn('getVideoDetails')(function* (ytVideoId: string) {
		const response = yield* Effect.tryPromise({
			try: () =>
				youtube.videos.list({
					part: ['snippet', 'statistics', 'contentDetails', 'liveStreamingDetails', 'status'],
					id: [ytVideoId]
				}),
			catch: (cause) =>
				new YoutubeError({
					message: `Failed to get details for video ${ytVideoId}`,
					cause
				})
		});

		return yield* setVideoDetails(response.data.items?.[0], ytVideoId);
	});

	const getBatchVideoDetails = Effect.fn('getBatchVideoDetails')(function* (ytVideoIds: string[]) {
		if (ytVideoIds.length > 50) {
			return yield* new YoutubeError({ message: 'Maximum of 50 videos can be fetched at once' });
		}

		const response = yield* Effect.tryPromise({
			try: () =>
				youtube.videos.list({
					part: ['snippet', 'statistics', 'contentDetails', 'liveStreamingDetails', 'status'],
					id: ytVideoIds
				}),
			catch: (cause) =>
				new YoutubeError({
					message: `Failed to get batch video details for ${ytVideoIds}`,
					cause
				})
		});

		const videoDetailsMap = new Map<string, Omit<Video, 'isShort'>>();
		const items = response.data.items ?? [];

		yield* Effect.forEach(
			items,
			(item) => {
				if (!item?.id) return Effect.void;

				return setVideoDetails(item, item.id).pipe(
					Effect.tap((videoDetails) =>
						Effect.sync(() => videoDetailsMap.set(item.id!, videoDetails))
					),
					Effect.catch(() => Effect.void)
				);
			},
			{ concurrency: 'unbounded' }
		);

		return videoDetailsMap;
	});

	const getVideoIdsFromUploadsPlaylist = Effect.fn('getVideoIdsFromUploadsPlaylist')(function* (
		ytChannelId: string,
		maxResults?: number
	) {
		const playlists = yield* Effect.tryPromise({
			try: () =>
				youtube.channels.list({
					part: ['contentDetails'],
					id: [ytChannelId]
				}),
			catch: (cause) =>
				new YoutubeError({
					message: `Failed to get playlists for channel ${ytChannelId}`,
					cause
				})
		});

		const uploadsPlaylistId = playlists.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
		if (!uploadsPlaylistId) {
			return yield* new YoutubeError({
				message: `Could not find uploads playlist for channel ${ytChannelId}`
			});
		}

		yield* Effect.logInfo(`Uploads playlist ID: ${uploadsPlaylistId}`);

		const videoIds: string[] = [];
		let nextPageToken: string | undefined;

		do {
			const playlistResponse = yield* Effect.tryPromise({
				try: () =>
					youtube.playlistItems.list({
						part: ['contentDetails'],
						playlistId: uploadsPlaylistId,
						maxResults: 50,
						...(nextPageToken !== undefined ? { pageToken: nextPageToken } : {})
					}),
				catch: (cause) =>
					new YoutubeError({
						message: `Failed to get playlist items for playlist ${uploadsPlaylistId}`,
						cause
					})
			});

			for (const item of playlistResponse.data.items || []) {
				if (item.contentDetails?.videoId) {
					videoIds.push(item.contentDetails.videoId);
				}
			}
			nextPageToken = playlistResponse.data.nextPageToken || undefined;
		} while (nextPageToken && (maxResults === undefined || videoIds.length < maxResults));

		return videoIds.slice(15);
	});

	const getRSSVideoIds = Effect.fn('getRSSVideoIds')(function* (ytChannelId: string) {
		return yield* Effect.gen(function* () {
			const response = yield* Effect.tryPromise({
				try: () => fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${ytChannelId}`),
				catch: (cause) =>
					new YoutubeError({
						message: `Failed to fetch RSS for channel ${ytChannelId}`,
						cause
					})
			});

			if (!response.ok) {
				return yield* new YoutubeError({
					message: `Failed to fetch RSS for channel ${ytChannelId} (HTTP ${response.status})`
				});
			}

			const xml = yield* Effect.tryPromise({
				try: () => response.text(),
				catch: (cause) => new YoutubeError({ message: 'Failed to read RSS text', cause })
			});

			return parseYtRSS(xml);
		}).pipe(
			Effect.retry(Schedule.exponential('1 seconds').pipe(Schedule.andThen(Schedule.recurs(3))))
		);
	});

	const isVideoShort = Effect.fn('isVideoShort')(function* (
		ytVideoId: string,
		ytChannelId: string
	) {
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
			catch: (cause) =>
				new YoutubeError({
					message: `Failed to check if video ${ytVideoId} is a short`,
					cause
				})
		});

		return (response.data.items?.length ?? 0) > 0;
	});

	const areVideosShorts = Effect.fn('areVideosShorts')(function* (
		ytVideoIds: string[],
		ytChannelId: string,
		maxResults?: number
	) {
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
						...(nextPageToken !== undefined ? { pageToken: nextPageToken } : {})
					}),
				catch: (cause) =>
					new YoutubeError({
						message: `Failed to fetch shorts playlist for ${ytChannelId}`,
						cause
					})
			});

			for (const item of playlistResponse.data.items || []) {
				if (item.contentDetails?.videoId) {
					shortsSet.add(item.contentDetails.videoId);
				}
			}
			nextPageToken = playlistResponse.data.nextPageToken || undefined;
		} while (nextPageToken && (maxResults === undefined || shortsSet.size < maxResults));

		return new Map(ytVideoIds.map((videoId) => [videoId, shortsSet.has(videoId)]));
	});

	const getLiveStreamVideoIds = Effect.fn('getLiveStreamVideoIds')(function* (
		ytChannelId: string,
		maxResults: number = 10
	) {
		const livestreamsPlaylistId = getYtPlaylistId(ytChannelId, 'livestreams');
		if (!livestreamsPlaylistId) return [];

		const response = yield* Effect.tryPromise({
			try: () =>
				youtube.playlistItems.list({
					part: ['contentDetails'],
					playlistId: livestreamsPlaylistId,
					maxResults
				}),
			catch: (cause) =>
				new YoutubeError({
					message: `Failed to fetch livestreams playlist for ${ytChannelId}`,
					cause
				})
		});

		const videoIds: string[] = [];
		for (const item of response.data.items || []) {
			if (item.contentDetails?.videoId) {
				videoIds.push(item.contentDetails.videoId);
			}
		}

		return videoIds;
	});

	return {
		getChannelDetails,
		getVideoDetails,
		getBatchVideoDetails,
		getVideoIdsFromUploadsPlaylist,
		getRSSVideoIds,
		isVideoShort,
		areVideosShorts,
		getLiveStreamVideoIds
	};
});

type YoutubeServiceShape = Effect.Success<typeof youtubeService>;

export class YoutubeService extends Context.Service<YoutubeService, YoutubeServiceShape>()(
	'@hc/content-sync/yt-service/YoutubeService',
	{ make: youtubeService }
) {}
