import { google } from 'googleapis';
import { Effect } from 'effect';
import { TaggedError } from 'effect/Data';
import { DbService } from '../db';
import { isShort } from './isShort';
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
				isShort: isShort(item.contentDetails?.duration || '')
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
			type Details = Pick<Video, 'commentCount' | 'duration' | 'isLiveStream' | 'isShort'>;
			const detailsMap: Record<string, Details> = {};

			for (const item of items) {
				if (item.id) {
					detailsMap[item.id] = {
						commentCount: parseInt(item.statistics?.commentCount || '0', 10),
						duration: item.contentDetails?.duration || '',
						isLiveStream: item.liveStreamingDetails ? true : false,
						isShort: isShort(item.contentDetails?.duration || '')
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

			return parseYouTubeRSS(xml);
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

	return {
		getChannelDetails,
		getVideoDetails,
		getBatchRSSVideoDetails,
		getRSSVideos,
		getVideosFromUploadsPlaylist
	};
});

export class YoutubeService extends Effect.Service<YoutubeService>()('YoutubeService', {
	effect: youtubeService
}) {}
