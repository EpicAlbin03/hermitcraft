import type { Video } from '@hc/db/schema';
import * as Context from 'effect/Context';
import * as Data from 'effect/Data';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { CreatorSync, type CreatorSyncInput } from './creator-sync';
import { DbService } from './db-service';
import { TwitchService } from './twitch-service';
import { YoutubeLiveStatusSync } from './youtube-live-status-sync';
import { YoutubeService } from './yt-service';

class SyncError extends Data.TaggedError('SyncError')<{ message: string; cause?: unknown }> {}

type SyncChannelInput = CreatorSyncInput;

type SyncVideosArgs = {
	taskName?: string;
	backfill?: boolean;
	maxResults?: number;
};

const syncService = Effect.gen(function* () {
	const db = yield* DbService;
	const yt = yield* YoutubeService;
	const twitch = yield* TwitchService;
	const creatorSync = yield* CreatorSync;
	const youtubeLiveStatusSync = yield* YoutubeLiveStatusSync;

	const syncChannel = Effect.fn('syncChannel')(function* (input: SyncChannelInput) {
		return yield* creatorSync
			.syncCreator(input)
			.pipe(
				Effect.catchTag(
					'CreatorSyncError',
					(err) => new SyncError({ message: err.message, cause: err.cause })
				)
			);
	});

	const syncVideoBase = Effect.fn('syncVideoBase')(function* (ytVideoId: string) {
		const videoDetails = yield* yt.getVideoDetails(ytVideoId);
		const videoIsShort = yield* yt.isVideoShort(ytVideoId, videoDetails.ytChannelId);

		yield* db.upsertVideo({
			ytVideoId,
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

		yield* youtubeLiveStatusSync.recomputeYoutubeLiveStatus([videoDetails.ytChannelId]);
	});

	const syncVideo = Effect.fn('syncVideo')(function* (ytVideoId: string) {
		return yield* syncVideoBase(ytVideoId).pipe(
			Effect.catchTag(
				'DbError',
				(err) => new SyncError({ message: `DB ERROR: ${err.message}`, cause: err.cause })
			),
			Effect.catchTag(
				'YoutubeError',
				(err) => new SyncError({ message: `YOUTUBE ERROR: ${err.message}`, cause: err.cause })
			),
			Effect.catchTag(
				'YoutubeLiveStatusSyncError',
				(err) => new SyncError({ message: err.message, cause: err.cause })
			)
		);
	});

	const syncChannelsBase = Effect.fn('syncChannelsBase')(function* (
		channels: SyncChannelInput[],
		taskName?: string
	) {
		yield* creatorSync.syncCreators(channels, taskName);
	});

	const syncChannels = Effect.fn('syncChannels')(function* (
		channels: SyncChannelInput[],
		taskName?: string
	) {
		return yield* syncChannelsBase(channels, taskName);
	});

	const syncVideosBase = Effect.fn('syncVideosBase')(function* (
		ytChannelIds: string[],
		args: SyncVideosArgs
	) {
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
				(args.backfill
					? yt.getVideoIdsFromUploadsPlaylist(ytChannelId, args.maxResults)
					: yt.getRSSVideoIds(ytChannelId).pipe(Effect.map((ids) => ids.slice(0, args.maxResults)))
				).pipe(
					Effect.matchEffect({
						onSuccess: (videoIds) =>
							Effect.sync(() => {
								videosByChannel.set(ytChannelId, videoIds);
								allVideoIds.push(...videoIds);
							}),
						onFailure: (error) =>
							Effect.logError(`${fullTaskName}Failed to get video IDs for ${ytChannelId}`, error)
					})
				),
			{ concurrency: 5 }
		);

		// Step 1.5: Include currently-referenced live video IDs so ended/private streams get re-checked
		const channelsWithLive = yield* db.getAllChannels();
		const allVideoIdsSet = new Set(allVideoIds);
		for (const channel of channelsWithLive) {
			if (channel.ytLiveVideoId && !allVideoIdsSet.has(channel.ytLiveVideoId)) {
				allVideoIds.push(channel.ytLiveVideoId);
				allVideoIdsSet.add(channel.ytLiveVideoId);
				const channelVideos = videosByChannel.get(channel.ytChannelId) || [];
				channelVideos.push(channel.ytLiveVideoId);
				videosByChannel.set(channel.ytChannelId, channelVideos);
			}
		}

		// Step 2: Check which videos already exist in DB and get their isShort values
		const existingVideos = yield* db.getVideos(allVideoIds);
		const existingVideoIds = new Set(existingVideos.map((video) => video.ytVideoId));
		const existingShortsMap = new Map(
			existingVideos.map((video) => [video.ytVideoId, video.isShort])
		);

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
			yield* Effect.logInfo(
				`${fullTaskName}Marked ${markedCount} videos as private (no longer accessible via API)`
			);
		}

		// Step 4: Get areVideosShorts per channel ONLY for new videos (not in DB)
		const allShortsMap = new Map<string, boolean>(existingShortsMap);
		yield* Effect.forEach(
			ytChannelIds,
			(ytChannelId) => {
				const videoIds = videosByChannel.get(ytChannelId) || [];
				const newVideoIds = videoIds.filter((id) => !existingVideoIds.has(id));
				if (newVideoIds.length === 0) return Effect.void;

				return yt.areVideosShorts(newVideoIds, ytChannelId, args.maxResults).pipe(
					Effect.catchTag('YoutubeError', (error) =>
						Effect.logWarning(`${fullTaskName}${error.message}, marking all as non-shorts`).pipe(
							Effect.as(new Map<string, boolean>())
						)
					),
					Effect.tap((shortsMap) =>
						Effect.sync(() => {
							for (const [id, isShort] of shortsMap.entries()) {
								allShortsMap.set(id, isShort);
							}
						})
					)
				);
			},
			{ concurrency: 5 }
		);

		// Step 5: Upsert all videos
		yield* Effect.logInfo(`${fullTaskName}Syncing videos`);
		yield* Effect.forEach(
			allVideoDetailsMap.entries(),
			([ytVideoId, videoDetails]) =>
				db.upsertVideo({ ...videoDetails, isShort: allShortsMap.get(ytVideoId) ?? false }).pipe(
					Effect.matchEffect({
						onSuccess: (result) => {
							if (result.wasSkipped) {
								return Effect.sync(() => {
									skipCount++;
								}).pipe(
									Effect.andThen(Effect.logWarning(`${fullTaskName}Skipped video ${ytVideoId}`))
								);
							}

							return Effect.sync(() => {
								successCount++;
							});
						},
						onFailure: (error) =>
							Effect.sync(() => {
								errorCount++;
							}).pipe(
								Effect.andThen(
									Effect.logError(`${fullTaskName}Failed to sync video ${ytVideoId}`, error)
								)
							)
					})
				),
			{ concurrency: 5 }
		);

		yield* youtubeLiveStatusSync.recomputeYoutubeLiveStatus(ytChannelIds, args.taskName);

		yield* Effect.logInfo(
			`VIDEO SYNC COMPLETED: ${successCount} videos synced, ${errorCount} videos failed, ${skipCount} videos skipped`
		);
		yield* Effect.logInfo(`VIDEO SYNC TOOK ${performance.now() - start}ms`);
	});

	const syncVideos = Effect.fn('syncVideos')(function* (
		ytChannelIds: string[],
		args: SyncVideosArgs
	) {
		return yield* syncVideosBase(ytChannelIds, args).pipe(
			Effect.catchTag(
				'DbError',
				(err) => new SyncError({ message: `DB ERROR: ${err.message}`, cause: err.cause })
			),
			Effect.catchTag(
				'YoutubeError',
				(err) => new SyncError({ message: `YOUTUBE ERROR: ${err.message}`, cause: err.cause })
			),
			Effect.catchTag(
				'YoutubeLiveStatusSyncError',
				(err) => new SyncError({ message: err.message, cause: err.cause })
			)
		);
	});

	const syncTwitchLiveBase = Effect.fn('syncTwitchLiveBase')(function* (taskName?: string) {
		const start = performance.now();
		const channels = yield* db.getAllChannels();
		const twitchUserIds = channels
			.map((channel) => channel.twitchUserId)
			.filter((id) => id !== null && id !== undefined);

		const isTwitchLiveMap = yield* twitch.areChannelsLive(twitchUserIds);

		let successCount = 0;
		let errorCount = 0;
		const fullTaskName = taskName ? `${taskName}: ` : '';

		yield* Effect.logInfo(`${fullTaskName}Syncing channels (twitch)`);
		const updates = channels.map((channel) => ({
			ytChannelId: channel.ytChannelId,
			isTwitchLive: channel.twitchUserId
				? (isTwitchLiveMap.get(channel.twitchUserId) ?? false)
				: false
		}));

		yield* db.setTwitchLiveStatuses(updates).pipe(
			Effect.tap(() =>
				Effect.sync(() => {
					successCount = updates.length;
				})
			),
			Effect.catchTag('DbError', (error) =>
				Effect.sync(() => {
					errorCount = updates.length;
				}).pipe(
					Effect.andThen(Effect.logError(`${fullTaskName}Failed to sync twitch live status`, error))
				)
			)
		);

		yield* Effect.logInfo(
			`TWITCH LIVE SYNC COMPLETED: ${successCount} channels synced, ${errorCount} channels failed`
		);
		yield* Effect.logInfo(`TWITCH LIVE SYNC TOOK ${performance.now() - start}ms`);
	});

	const syncTwitchLive = Effect.fn('syncTwitchLive')(function* (taskName?: string) {
		return yield* syncTwitchLiveBase(taskName).pipe(
			Effect.catchTag(
				'DbError',
				(err) => new SyncError({ message: `DB ERROR: ${err.message}`, cause: err.cause })
			),
			Effect.catchTag(
				'TwitchError',
				(err) => new SyncError({ message: `TWITCH ERROR: ${err.message}`, cause: err.cause })
			)
		);
	});

	const syncYoutubeLiveBase = Effect.fn('syncYoutubeLiveBase')(function* (taskName?: string) {
		const channels = yield* db.getAllChannels();

		yield* youtubeLiveStatusSync.refreshYoutubeLiveStatus(
			channels.map((channel) => channel.ytChannelId),
			taskName
		);
	});

	const syncYoutubeLive = Effect.fn('syncYoutubeLive')(function* (taskName?: string) {
		return yield* syncYoutubeLiveBase(taskName).pipe(
			Effect.catchTag(
				'DbError',
				(err) => new SyncError({ message: `DB ERROR: ${err.message}`, cause: err.cause })
			),
			Effect.catchTag(
				'YoutubeLiveStatusSyncError',
				(err) => new SyncError({ message: err.message, cause: err.cause })
			)
		);
	});

	return {
		syncChannel,
		syncVideo,
		syncChannels,
		syncVideos,
		syncTwitchLive,
		syncYoutubeLive
	} as const;
});

type SyncServiceShape = Effect.Success<typeof syncService>;

export class SyncService extends Context.Service<SyncService, SyncServiceShape>()(
	'@hc/content-sync/sync-service/SyncService',
	{ make: syncService }
) {
	static readonly layer = Layer.effect(this, this.make);
}
