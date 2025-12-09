import { Effect, Console } from 'effect';
import { DbService } from './db';
import { YoutubeService } from './youtube';
import { TaggedError } from 'effect/Data';
import type { Channel, ChannelLink, Video } from '@hc/db';
import { TwitchService } from './twitch';

class SyncVideoError extends TaggedError('SyncVideoError') {
	constructor(message: string, options?: { cause?: unknown }) {
		super();
		this.message = message;
		this.cause = options?.cause;
	}
}

const channelSyncService = Effect.gen(function* () {
	const db = yield* DbService;
	const yt = yield* YoutubeService;
	const twitch = yield* TwitchService;

	const syncChannel = (
		ytChannelId: string,
		details: {
			twitchUserId?: string;
			twitchUserLogin?: string;
			isTwitchLive?: boolean;
			isYtLive?: boolean;
			links?: ChannelLink[];
		}
	) =>
		Effect.gen(function* () {
			const channelDetails = yield* yt.getChannelDetails(ytChannelId);
			const isTwitchLive =
				details.isTwitchLive ??
				(details.twitchUserId ? yield* twitch.isChannelLive(details.twitchUserId) : false);
			const isYtLive = details.isYtLive ?? false; // TODO: isYoutubeLive()
			const links = details.links ?? [];

			yield* db.upsertChannel({
				ytChannelId: ytChannelId,
				ytName: channelDetails.ytName,
				ytHandle: channelDetails.ytHandle,
				ytDescription: channelDetails.ytDescription,
				ytAvatarUrl: channelDetails.ytAvatarUrl,
				ytBannerUrl: channelDetails.ytBannerUrl,
				ytViewCount: channelDetails.ytViewCount,
				ytSubscriberCount: channelDetails.ytSubscriberCount,
				ytVideoCount: channelDetails.ytVideoCount,
				ytJoinedAt: channelDetails.ytJoinedAt,
				twitchUserLogin: details.twitchUserLogin,
				isTwitchLive: isTwitchLive,
				isYtLive: isYtLive,
				links: links
			} as Channel);
		}).pipe(
			Effect.catchTag(
				'DbError',
				(err) => new SyncVideoError(`DB ERROR: ${err.message}`, { cause: err.cause })
			),
			Effect.catchTag(
				'YoutubeError',
				(err) => new SyncVideoError(`YOUTUBE ERROR: ${err.message}`, { cause: err.cause })
			)
		);

	const syncVideo = (ytVideoId: string) =>
		Effect.gen(function* () {
			const videoDetails = yield* yt.getVideoDetails(ytVideoId);
			const videoIsShort = yield* yt.isVideoShort(ytVideoId, videoDetails.ytChannelId);

			yield* db.upsertVideo({
				ytVideoId: ytVideoId,
				ytChannelId: videoDetails.ytChannelId,
				title: videoDetails.title,
				thumbnailUrl: videoDetails.thumbnailUrl,
				publishedAt: videoDetails.publishedAt,
				viewCount: videoDetails.viewCount,
				likeCount: videoDetails.likeCount,
				commentCount: videoDetails.commentCount,
				duration: videoDetails.duration,
				isShort: videoIsShort,
				livestreamType: videoDetails.livestreamType,
				livestreamScheduledStartTime: videoDetails.livestreamScheduledStartTime,
				livestreamActualStartTime: videoDetails.livestreamActualStartTime,
				livestreamConcurrentViewers: videoDetails.livestreamConcurrentViewers
			});
		}).pipe(
			Effect.catchTag(
				'DbError',
				(err) => new SyncVideoError(`DB ERROR: ${err.message}`, { cause: err.cause })
			),
			Effect.catchTag(
				'YoutubeError',
				(err) => new SyncVideoError(`YOUTUBE ERROR: ${err.message}`, { cause: err.cause })
			)
		);

	const syncChannels = (
		channels: {
			ytChannelId: string;
			twitchUserId?: string;
			twitchUserLogin?: string;
			isTwitchLive?: boolean;
			isYtLive?: boolean;
			links?: ChannelLink[];
		}[],
		taskName?: string
	) =>
		Effect.gen(function* () {
			const start = performance.now();

			const isTwitchLiveMap = yield* twitch.areChannelsLive(
				channels.map((c) => c.twitchUserId).filter((id) => id !== null && id !== undefined)
			);

			let successCount = 0;
			let errorCount = 0;
			const fullTaskName = taskName ? `${taskName}: ` : '';

			yield* Effect.forEach(
				channels,
				(channel) =>
					Effect.gen(function* () {
						yield* Console.log(`${fullTaskName}Syncing channel ${channel.ytChannelId}`);
						const result = yield* syncChannel(channel.ytChannelId, {
							twitchUserId: channel.twitchUserId ?? undefined,
							twitchUserLogin: channel.twitchUserLogin ?? undefined,
							isTwitchLive: channel.twitchUserId
								? (isTwitchLiveMap.get(channel.twitchUserId) ?? false)
								: undefined,
							isYtLive: channel.isYtLive ?? false, // TODO: isYoutubeLive()
							links: channel.links ?? []
						}).pipe(Effect.either);

						if (result._tag === 'Right') {
							successCount++;
							yield* Console.log(`${fullTaskName}Synced channel ${channel.ytChannelId}`);
						} else {
							errorCount++;
							yield* Console.error(`${fullTaskName}Failed to sync channel`, result.left);
						}
					}),
				{ concurrency: 5 }
			);

			yield* Console.log(
				`CHANNEL SYNC COMPLETED: ${successCount} channels synced, ${errorCount} channels failed`
			);
			yield* Console.log(`CHANNEL SYNC TOOK ${performance.now() - start}ms`);
		});

	const syncVideos = (ytChannelIds: string[], taskName?: string) =>
		Effect.gen(function* () {
			const start = performance.now();

			let successCount = 0;
			let errorCount = 0;
			let skipCount = 0;
			const fullTaskName = taskName ? `${taskName}: ` : '';

			const videoDetails = yield* yt.getBatchVideoDetails(ytChannelIds);

			yield* Effect.forEach(
				videoDetails.entries(),
				([ytVideoId, videoDetails]) =>
					Effect.gen(function* () {
						const videoIsShort = yield* yt.isVideoShort(ytVideoId, videoDetails.ytChannelId);
						yield* Console.log(`${fullTaskName}Syncing video ${ytVideoId}`);
						const result = yield* db
							.upsertVideo({
								...videoDetails,
								isShort: videoIsShort
							})
							.pipe(Effect.either);

						if (result._tag === 'Right') {
							if (result.right?.wasSkipped) {
								skipCount++;
								yield* Console.warn(`\x1b[33m${fullTaskName}Skipped video ${ytVideoId}\x1b[0m`);
							} else {
								successCount++;
								yield* Console.log(`${fullTaskName}Synced video ${ytVideoId}`);
							}
						} else {
							errorCount++;
							yield* Console.error(`${fullTaskName}Failed to sync video ${ytVideoId}`, result.left);
						}
					}),
				{ concurrency: 5 }
			);

			yield* Console.log(
				`VIDEO SYNC COMPLETED: ${successCount} videos synced, ${errorCount} videos failed, ${skipCount} videos skipped`
			);
			yield* Console.log(`VIDEO SYNC TOOK ${performance.now() - start}ms`);
		});

	const backfillVideos = (ytChannelId: string) =>
		Effect.gen(function* () {
			const start = performance.now();
			yield* Console.log(`BACKFILL: Starting backfill for channel ${ytChannelId}`);

			const channel = yield* db.getChannel(ytChannelId);
			if (!channel) {
				return yield* Effect.fail(new SyncVideoError(`BACKFILL: Channel not found ${ytChannelId}`));
			}

			const videoIds = yield* yt.getVideoIdsFromUploadsPlaylist(ytChannelId);

			const batches = videoIds.reduce((acc, videoId, index) => {
				const batchIndex = Math.floor(index / 50);
				if (!acc[batchIndex]) {
					acc[batchIndex] = [];
				}
				acc[batchIndex].push(videoId);
				return acc;
			}, [] as string[][]);
			yield* Console.log(
				`BACKFILL: Found ${videoIds.length} videos (${batches.length} batches) to backfill`
			);

			yield* Effect.forEach(batches, (batch) => syncVideos(batch, 'BACKFILL'), { concurrency: 5 });

			yield* Console.log(`BACKFILL: Backfill completed in ${performance.now() - start}ms`);
		});

	return {
		syncChannel,
		syncVideo,
		syncChannels,
		syncVideos,
		backfillVideos
	};
});

export class ChannelSyncService extends Effect.Service<ChannelSyncService>()('ChannelSyncService', {
	dependencies: [YoutubeService.Default, TwitchService.Default],
	effect: channelSyncService
}) {}

export * from './db';
export * from './youtube';
export * from './twitch';
