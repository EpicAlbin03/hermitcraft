import { google } from 'googleapis';
import { Effect } from 'effect';
import { TaggedError } from 'effect/Data';
import { DbService } from '../db';
import { getShortsPlaylistId } from './utils';
import type { Video } from '@hc/db';
import { parseYouTubeRSS } from './rss';

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

	const db = yield* DbService;

	const getChannelDetails = (data: { ytChannelId: string }) =>
		Effect.gen(function* () {
			const response = yield* Effect.tryPromise({
				try: () =>
					youtube.channels.list({
						part: ['id', 'snippet', 'statistics', 'brandingSettings'],
						id: [data.ytChannelId]
					}),
				catch: (err) =>
					new YoutubeError(`Failed to get details for channel ${data.ytChannelId}`, {
						cause: err
					})
			});

			const item = response.data.items?.[0];
			if (!item || !item.id || !item.snippet) {
				return yield* Effect.fail(new YoutubeError(`Channel ${data.ytChannelId} not found`));
			}

			const thumbnail =
				item.snippet.thumbnails?.maxres ||
				item.snippet.thumbnails?.standard ||
				item.snippet.thumbnails?.high ||
				item.snippet.thumbnails?.medium ||
				item.snippet.thumbnails?.default;

			return {
				ytChannelId: item.id,
				name: item.snippet.title || '',
				description: item.snippet.description || '',
				thumbnailUrl: thumbnail?.url || '',
				bannerUrl: item.brandingSettings?.image?.bannerExternalUrl || '',
				handle: item.snippet.customUrl || '',
				viewCount: parseInt(item.statistics?.viewCount || '0', 10),
				subscriberCount: parseInt(item.statistics?.subscriberCount || '0', 10),
				videoCount: parseInt(item.statistics?.videoCount || '0', 10),
				joinedAt: new Date(item.snippet.publishedAt || 0)
			};
		});

	const checkIfVideoIsShort = (args: { ytVideoId: string; ytChannelId: string }) =>
		Effect.gen(function* () {
			const shortsPlaylistId = getShortsPlaylistId(args.ytChannelId);
			if (!shortsPlaylistId) return false;

			const response = yield* Effect.tryPromise({
				try: () =>
					youtube.playlistItems.list({
						part: ['id'],
						playlistId: shortsPlaylistId,
						videoId: args.ytVideoId,
						maxResults: 1
					}),
				catch: (err) =>
					new YoutubeError(`Failed to check if video ${args.ytVideoId} is a short`, {
						cause: err
					})
			});

			return (response.data.items?.length ?? 0) > 0;
		});

	const getVideoDetails = (data: { ytVideoId: string }) =>
		Effect.gen(function* () {
			const response = yield* Effect.tryPromise({
				try: () =>
					youtube.videos.list({
						part: ['snippet', 'statistics', 'contentDetails', 'liveStreamingDetails'],
						id: [data.ytVideoId]
					}),
				catch: (err) =>
					new YoutubeError(`Failed to get details for video ${data.ytVideoId}`, { cause: err })
			});

			const item = response.data.items?.[0];
			if (!item || !item.id || !item.snippet || !item.snippet.channelId) {
				return yield* Effect.fail(new YoutubeError(`Video ${data.ytVideoId} not found`));
			}

			const thumbnail =
				item.snippet.thumbnails?.maxres ||
				item.snippet.thumbnails?.standard ||
				item.snippet.thumbnails?.high ||
				item.snippet.thumbnails?.medium ||
				item.snippet.thumbnails?.default;

			const videoIsShort = yield* checkIfVideoIsShort({
				ytVideoId: data.ytVideoId,
				ytChannelId: item.snippet.channelId
			}).pipe(Effect.catchAll(() => Effect.succeed(false)));

			return {
				ytVideoId: item.id,
				ytChannelId: item.snippet.channelId,
				title: item.snippet.title || '',
				description: item.snippet.description || '',
				thumbnailUrl: thumbnail?.url || '',
				publishedAt: new Date(item.snippet.publishedAt || 0),
				viewCount: parseInt(item.statistics?.viewCount || '0', 10),
				likeCount: parseInt(item.statistics?.likeCount || '0', 10),
				commentCount: parseInt(item.statistics?.commentCount || '0', 10),
				duration: item.contentDetails?.duration || '',
				isLiveStream: item.liveStreamingDetails ? true : false,
				isShort: videoIsShort
			};
		});

	const getBatchRSSVideoDetails = (data: { ytVideoIds: string[] }) =>
		Effect.gen(function* () {
			const response = yield* Effect.tryPromise({
				try: () =>
					youtube.videos.list({
						part: ['statistics', 'contentDetails', 'liveStreamingDetails'],
						id: data.ytVideoIds
					}),
				catch: (err) =>
					new YoutubeError(`Failed to get batch video details for ${data.ytVideoIds}`, {
						cause: err
					})
			});

			const items = response.data.items || [];
			type Details = Pick<Video, 'commentCount' | 'duration' | 'isLiveStream'>;
			const detailsMap: Record<string, Details> = {};

			for (const item of items) {
				if (item.id) {
					detailsMap[item.id] = {
						commentCount: parseInt(item.statistics?.commentCount || '0', 10),
						duration: item.contentDetails?.duration || '',
						isLiveStream: item.liveStreamingDetails ? true : false
					};
				}
			}

			return detailsMap;
		});

	const getRSSVideos = (args: { ytChannelId: string }) =>
		Effect.gen(function* () {
			const channel = yield* db.getChannel(args.ytChannelId);
			if (!channel) {
				return yield* Effect.fail(
					new YoutubeError(`Channel ${args.ytChannelId} not found`, {
						cause: new Error('Channel not found')
					})
				);
			}

			const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${args.ytChannelId}`;

			const response = yield* Effect.tryPromise({
				try: () => fetch(rssUrl),
				catch: (err) => new YoutubeError(`Failed to fetch RSS for channel`, { cause: err })
			});

			if (!response.ok) {
				return yield* Effect.fail(
					new YoutubeError(`Failed to fetch RSS for channel ${args.ytChannelId}`)
				);
			}

			const xml = yield* Effect.tryPromise({
				try: () => response.text(),
				catch: (err) => new YoutubeError(`Failed to read RSS text`, { cause: err })
			});

			return parseYouTubeRSS(xml).map((v) => ({ ...v, ytChannelId: args.ytChannelId }));
		});

	const getVideosFromUploadsPlaylist = (args: { ytChannelId: string; maxResults?: number }) =>
		Effect.gen(function* () {
			const playlists = yield* Effect.tryPromise({
				try: () =>
					youtube.channels.list({
						part: ['contentDetails'],
						id: [args.ytChannelId]
					}),
				catch: (err) =>
					new YoutubeError(`Failed to get playlists for channel ${args.ytChannelId}`, {
						cause: err
					})
			});

			const uploadsPlaylistId =
				playlists.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;

			if (!uploadsPlaylistId) {
				return yield* Effect.fail(
					new YoutubeError(`Could not find uploads playlist for channel ${args.ytChannelId}`)
				);
			}

			yield* Effect.log(`Uploads playlist ID: ${uploadsPlaylistId}`);

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
			} while (
				nextPageToken &&
				(args.maxResults === undefined || videoIds.length < args.maxResults)
			);

			return videoIds;
		});

	const getShortsVideoIds = (args: { ytChannelId: string }) =>
		Effect.gen(function* () {
			const shortsPlaylistId = getShortsPlaylistId(args.ytChannelId);
			if (!shortsPlaylistId) return new Set<string>();

			const shortsSet = new Set<string>();
			let nextPageToken: string | undefined;

			do {
				const response = yield* Effect.tryPromise({
					try: () =>
						youtube.playlistItems.list({
							part: ['contentDetails'],
							playlistId: shortsPlaylistId,
							maxResults: 50,
							...(nextPageToken !== undefined && { pageToken: nextPageToken })
						}),
					catch: (err) =>
						new YoutubeError(`Failed to fetch shorts playlist for ${args.ytChannelId}`, {
							cause: err
						})
				});

				for (const item of response.data.items || []) {
					if (item.contentDetails?.videoId) {
						shortsSet.add(item.contentDetails.videoId);
					}
				}
				nextPageToken = response.data.nextPageToken || undefined;
			} while (nextPageToken);

			return shortsSet;
		});

	const checkIfVideosAreShorts = (args: { ytVideoIds: string[]; ytChannelId: string }) =>
		Effect.gen(function* () {
			const shortsSet = yield* getShortsVideoIds({ ytChannelId: args.ytChannelId }).pipe(
				Effect.catchAll(() => Effect.succeed(new Set<string>()))
			);

			const result = new Map<string, boolean>();
			for (const videoId of args.ytVideoIds) {
				result.set(videoId, shortsSet.has(videoId));
			}
			return result;
		});

	return {
		getChannelDetails,
		getVideoDetails,
		getBatchRSSVideoDetails,
		getRSSVideos,
		getVideosFromUploadsPlaylist,
		checkIfVideoIsShort,
		checkIfVideosAreShorts,
		getShortsVideoIds
	};
});

export class YoutubeService extends Effect.Service<YoutubeService>()('YoutubeService', {
	effect: youtubeService
}) {}
