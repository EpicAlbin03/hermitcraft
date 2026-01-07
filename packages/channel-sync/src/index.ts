import { Effect, Console } from 'effect';
import { DbService } from './db';
import { YoutubeService } from './youtube';
import { TaggedError } from 'effect/Data';
import { DB_SCHEMA, type ChannelLink, type Video } from '@hc/db';
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
		details?: {
			twitchUserId?: string;
			twitchUserLogin?: string;
			isTwitchLive?: boolean;
			ytLiveVideoId?: string;
			links?: ChannelLink[];
		}
	) =>
		Effect.gen(function* () {
			const channelDetails = yield* yt.getChannelDetails(ytChannelId);
			// const isTwitchLive =
			// 	details.isTwitchLive ||
			// 	(details.twitchUserId ? yield* twitch.isChannelLive(details.twitchUserId) : false);

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
				twitchUserId: details?.twitchUserId,
				twitchUserLogin: details?.twitchUserLogin,
				isTwitchLive: details?.isTwitchLive,
				ytLiveVideoId: details?.ytLiveVideoId,
				links: details?.links
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
				privacyStatus: videoDetails.privacyStatus,
				uploadStatus: videoDetails.uploadStatus,
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
			ytLiveVideoId?: string;
			links?: ChannelLink[];
		}[],
		taskName?: string
	) =>
		Effect.gen(function* () {
			const start = performance.now();

			// const isTwitchLiveMap = yield* twitch.areChannelsLive(
			// 	channels.map((c) => c.twitchUserId).filter((id) => id !== null && id !== undefined)
			// );

			let successCount = 0;
			let errorCount = 0;
			const fullTaskName = taskName ? `${taskName}: ` : '';

			yield* Console.log(`${fullTaskName}Syncing channels`);
			yield* Effect.forEach(
				channels,
				(channel) =>
					Effect.gen(function* () {
						// yield* Console.log(`${fullTaskName}Syncing channel ${channel.ytChannelId}`);
						const result = yield* syncChannel(channel.ytChannelId, {
							twitchUserId: channel.twitchUserId,
							twitchUserLogin: channel.twitchUserLogin,
							isTwitchLive: channel.isTwitchLive,
							ytLiveVideoId: channel.ytLiveVideoId,
							links: channel.links
						}).pipe(Effect.either);

						if (result._tag === 'Right') {
							successCount++;
							// yield* Console.log(`${fullTaskName}Synced channel ${channel.ytChannelId}`);
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

	const syncVideos = (
		ytChannelIds: string[],
		args: {
			taskName?: string;
			backfill?: boolean;
			maxResults?: number;
		}
	) =>
		Effect.gen(function* () {
			const start = performance.now();

			let successCount = 0;
			let errorCount = 0;
			let skipCount = 0;
			const fullTaskName = args.taskName ? `${args.taskName}: ` : '';

			// Step 1: Collect all video IDs from all channels
			const videosByChannel = new Map<string, string[]>();
			const allVideoIds: string[] = [];

			yield* Effect.forEach(
				ytChannelIds,
				(ytChannelId) =>
					Effect.gen(function* () {
						const result = yield* Effect.either(
							args.backfill
								? yt.getVideoIdsFromUploadsPlaylist(ytChannelId, args.maxResults)
								: Effect.map(yt.getRSSVideoIds(ytChannelId), (ids) => ids.slice(0, args.maxResults))
						);

						if (result._tag === 'Left') {
							yield* Console.error(
								`${fullTaskName}Failed to get video IDs for ${ytChannelId}`,
								result.left
							);
							return;
						}

						const videoIds = result.right;
						videosByChannel.set(ytChannelId, videoIds);
						allVideoIds.push(...videoIds);
					}),
				{ concurrency: 5 }
			);

			// Step 2: Check which videos already exist in DB and get their isShort values
			const existingVideos = yield* db.getVideos(allVideoIds, {
				ytVideoId: DB_SCHEMA.videos.ytVideoId,
				isShort: DB_SCHEMA.videos.isShort
			});
			const existingVideoIds = new Set(existingVideos.map((v) => v.ytVideoId));
			const existingShortsMap = new Map(existingVideos.map((v) => [v.ytVideoId, v.isShort]));

			// Step 3: Batch video IDs into groups of 50 for getBatchVideoDetails
			const allVideoDetailsMap = new Map<string, Omit<Video, 'isShort'>>();
			const missingVideoIds: string[] = [];

			for (let i = 0; i < allVideoIds.length; i += 50) {
				const batch = allVideoIds.slice(i, i + 50);
				const batchDetails = yield* yt.getBatchVideoDetails(batch);
				for (const [id, details] of batchDetails.entries()) {
					allVideoDetailsMap.set(id, details);
				}
				// Videos requested but not returned are private/deleted/unlisted
				for (const id of batch) {
					if (!batchDetails.has(id) && existingVideoIds.has(id)) {
						missingVideoIds.push(id);
					}
				}
			}

			// Mark missing videos as private (they were public before but are no longer accessible)
			if (missingVideoIds.length > 0) {
				const markedCount = yield* db.markVideosAsPrivate(missingVideoIds);
				yield* Console.log(
					`${fullTaskName}Marked ${markedCount} videos as private (no longer accessible via API)`
				);
			}

			// Step 4: Get areVideosShorts per channel ONLY for new videos (not in DB)
			const allShortsMap = new Map<string, boolean>(existingShortsMap);
			yield* Effect.forEach(
				ytChannelIds,
				(ytChannelId) =>
					Effect.gen(function* () {
						const videoIds = videosByChannel.get(ytChannelId) || [];
						const newVideoIds = videoIds.filter((id) => !existingVideoIds.has(id));
						if (newVideoIds.length === 0) return;

						const shortsMap = yield* yt
							.areVideosShorts(newVideoIds, ytChannelId, args.maxResults)
							.pipe(
								Effect.catchTag('YoutubeError', (err) =>
									Effect.gen(function* () {
										yield* Console.warn(
											`\x1b[33m${fullTaskName}${err.message}, marking all as non-shorts\x1b[0m`
										);
										return new Map<string, boolean>();
									})
								)
							);
						for (const [id, isShort] of shortsMap.entries()) {
							allShortsMap.set(id, isShort);
						}
					}),
				{ concurrency: 5 }
			);

			// Step 5: Upsert all videos
			yield* Console.log(`${fullTaskName}Syncing videos`);
			yield* Effect.forEach(
				allVideoDetailsMap.entries(),
				([ytVideoId, videoDetails]) =>
					Effect.gen(function* () {
						const videoIsShort = allShortsMap.get(ytVideoId) || false;
						// yield* Console.log(`${fullTaskName}Syncing video ${ytVideoId}`);
						const result = yield* db
							.upsertVideo({ ...videoDetails, isShort: videoIsShort })
							.pipe(Effect.either);

						if (result._tag === 'Right') {
							if (result.right?.wasSkipped) {
								skipCount++;
								yield* Console.warn(`\x1b[33m${fullTaskName}Skipped video ${ytVideoId}\x1b[0m`);
							} else {
								successCount++;
								// yield* Console.log(`${fullTaskName}Synced video ${ytVideoId}`);
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

	const syncTwitchLive = (taskName?: string) =>
		Effect.gen(function* () {
			const start = performance.now();
			const channels = yield* db.getAllChannels({
				ytChannelId: DB_SCHEMA.channels.ytChannelId,
				twitchUserId: DB_SCHEMA.channels.twitchUserId
			});
			const twitchUserIds = channels
				.map((channel) => channel.twitchUserId)
				.filter((id) => id !== null && id !== undefined);

			const isTwitchLiveMap = yield* twitch.areChannelsLive(twitchUserIds);

			let successCount = 0;
			let errorCount = 0;
			const fullTaskName = taskName ? `${taskName}: ` : '';

			yield* Console.log(`${fullTaskName}Syncing channels (twitch)`);
			yield* Effect.forEach(channels, (channel) =>
				Effect.gen(function* () {
					const result = yield* db
						.updateChannel(channel.ytChannelId, {
							isTwitchLive: channel.twitchUserId
								? isTwitchLiveMap.get(channel.twitchUserId) || false
								: false
						})
						.pipe(Effect.either);

					if (result._tag === 'Right') {
						successCount++;
						// yield* Console.log(`${fullTaskName}Synced channel (twitch) ${channel.ytChannelId}`);
					} else {
						errorCount++;
						yield* Console.error(
							`${fullTaskName}Failed to sync channel (twitch) ${channel.ytChannelId}`,
							result.left
						);
					}
				})
			);

			yield* Console.log(
				`TWITCH LIVE SYNC COMPLETED: ${successCount} channels synced, ${errorCount} channels failed`
			);
			yield* Console.log(`TWITCH LIVE SYNC TOOK ${performance.now() - start}ms`);

			return isTwitchLiveMap;
		});

	return {
		syncChannel,
		syncVideo,
		syncChannels,
		syncVideos,
		syncTwitchLive
	};
});

export class ChannelSyncService extends Effect.Service<ChannelSyncService>()('ChannelSyncService', {
	dependencies: [DbService.Default, YoutubeService.Default, TwitchService.Default],
	effect: channelSyncService
}) {}

export * from './db';
export * from './youtube';
export * from './twitch';
