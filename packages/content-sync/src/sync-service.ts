import * as Clock from 'effect/Clock';
import * as Context from 'effect/Context';
import * as Data from 'effect/Data';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Ref from 'effect/Ref';
import { CreatorCatalog } from './creator-catalog';
import { CreatorSync, type CreatorSyncInput } from './creator-sync';
import { DbService } from './db-service';
import { TwitchService } from './twitch-service';
import { VideoSync } from './video-sync';
import { YtLiveStatusSync } from './yt-live-status-sync';
import { YtService } from './yt-service';

class SyncError extends Data.TaggedError('SyncError')<{ message: string; cause?: unknown }> {}

export type RunVideoSyncArgs = {
	taskName?: string;
	maxResults?: number;
};

const syncService = Effect.gen(function* () {
	const creatorCatalog = yield* CreatorCatalog;
	const creatorSync = yield* CreatorSync;
	const db = yield* DbService;
	const twitch = yield* TwitchService;
	const videoSync = yield* VideoSync;
	const yt = yield* YtService;
	const ytLiveStatusSync = yield* YtLiveStatusSync;

	const syncCreator = Effect.fn('syncCreator')(function* (input: CreatorSyncInput) {
		return yield* creatorSync.syncCreator(input).pipe(
			Effect.catchTags({
				CreatorSyncError: (err) => new SyncError({ message: err.message, cause: err.cause })
			}),
			Effect.annotateLogs({ ytChannelId: input.ytChannelId }),
			Effect.withSpan('SyncService.syncCreator')
		);
	});

	const syncVideo = Effect.fn('syncVideo')(function* (ytVideoId: string, taskName?: string) {
		return yield* Effect.gen(function* () {
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

			yield* ytLiveStatusSync.recomputeYtLiveStatus([videoDetails.ytChannelId], taskName);
		}).pipe(
			Effect.catchTags({
				DbError: (err) => new SyncError({ message: `DB ERROR: ${err.message}`, cause: err.cause }),
				YtError: (err) => new SyncError({ message: `YT ERROR: ${err.message}`, cause: err.cause }),
				YtLiveStatusSyncError: (err) => new SyncError({ message: err.message, cause: err.cause })
			}),
			Effect.annotateLogs({ ytVideoId, ...(taskName ? { taskName } : {}) }),
			Effect.withSpan('SyncService.syncVideo')
		);
	});

	const runCreatorSync = Effect.fn('runCreatorSync')(function* (taskName?: string) {
		return yield* Effect.gen(function* () {
			const creators = yield* creatorCatalog.listTrackedCreators();
			yield* creatorSync.syncCreators(creators, taskName);
		}).pipe(
			Effect.catchTags({
				CreatorCatalogError: (err) => new SyncError({ message: err.message, cause: err.cause })
			}),
			Effect.annotateLogs(taskName ? { taskName } : {}),
			Effect.withSpan('SyncService.runCreatorSync')
		);
	});

	const runVideoSync = Effect.fn('runVideoSync')(function* (args: RunVideoSyncArgs) {
		return yield* Effect.gen(function* () {
			const ytChannelIds = yield* creatorCatalog.listTrackedCreatorIds();
			yield* videoSync.syncVideosForChannels(ytChannelIds, args).pipe(
				Effect.annotateLogs({
					ytChannelCount: ytChannelIds.length,
					...(args.taskName ? { taskName: args.taskName } : {})
				})
			);
		}).pipe(
			Effect.catchTags({
				CreatorCatalogError: (err) => new SyncError({ message: err.message, cause: err.cause }),
				VideoSyncError: (err) => new SyncError({ message: err.message, cause: err.cause })
			}),
			Effect.withSpan('SyncService.runVideoSync')
		);
	});

	const runVideoBackfill = Effect.fn('runVideoBackfill')(function* (taskName?: string) {
		return yield* Effect.gen(function* () {
			const ytChannelIds = yield* creatorCatalog.listTrackedCreatorIds();
			yield* videoSync
				.syncVideosForChannels(ytChannelIds, {
					backfill: true,
					...(taskName ? { taskName } : {})
				})
				.pipe(
					Effect.annotateLogs({
						ytChannelCount: ytChannelIds.length,
						...(taskName ? { taskName } : {})
					})
				);
		}).pipe(
			Effect.catchTags({
				CreatorCatalogError: (err) => new SyncError({ message: err.message, cause: err.cause }),
				VideoSyncError: (err) => new SyncError({ message: err.message, cause: err.cause })
			}),
			Effect.withSpan('SyncService.runVideoBackfill')
		);
	});

	const runTwitchLiveStatusSync = Effect.fn('runTwitchLiveStatusSync')(function* (
		taskName?: string
	) {
		return yield* Effect.gen(function* () {
			const start = yield* Clock.currentTimeMillis;
			const counts = yield* Ref.make({ successCount: 0, errorCount: 0 });
			const creators = yield* creatorCatalog.listTrackedCreators();
			const twitchUserIds = creators
				.map((creator) => creator.twitchUserId)
				.filter((id) => id !== null && id !== undefined);
			const isTwitchLiveMap = yield* twitch.areChannelsLive(twitchUserIds);
			const fullTaskName = taskName ? `${taskName}: ` : '';

			yield* Effect.logInfo(`${fullTaskName}Syncing creators (twitch)`);
			const updates = creators.map((creator) => ({
				ytChannelId: creator.ytChannelId,
				isTwitchLive: creator.twitchUserId
					? (isTwitchLiveMap.get(creator.twitchUserId) ?? false)
					: false
			}));

			yield* creatorCatalog.setTrackedCreatorTwitchLiveStatuses(updates).pipe(
				Effect.tap(() =>
					Ref.update(counts, () => ({ successCount: updates.length, errorCount: 0 }))
				),
				Effect.catchTag('CreatorCatalogError', (error) =>
					Ref.update(counts, () => ({ successCount: 0, errorCount: updates.length })).pipe(
						Effect.andThen(
							Effect.logError(`${fullTaskName}Failed to sync twitch live status`, error)
						)
					)
				)
			);

			const { successCount, errorCount } = yield* Ref.get(counts);
			const end = yield* Clock.currentTimeMillis;
			yield* Effect.logInfo(
				`TWITCH LIVE SYNC COMPLETED: ${successCount} creators synced, ${errorCount} creators failed`
			);
			yield* Effect.logInfo(`TWITCH LIVE SYNC TOOK ${end - start}ms`);
		}).pipe(
			Effect.catchTags({
				CreatorCatalogError: (err) => new SyncError({ message: err.message, cause: err.cause }),
				TwitchError: (err) =>
					new SyncError({ message: `TWITCH ERROR: ${err.message}`, cause: err.cause })
			}),
			Effect.annotateLogs(taskName ? { taskName } : {}),
			Effect.withSpan('SyncService.runTwitchLiveStatusSync')
		);
	});

	const runYtLiveStatusSync = Effect.fn('runYtLiveStatusSync')(function* (taskName?: string) {
		return yield* Effect.gen(function* () {
			const ytChannelIds = yield* creatorCatalog.listTrackedCreatorIds();
			yield* ytLiveStatusSync.refreshYtLiveStatus(ytChannelIds, taskName).pipe(
				Effect.catchTag(
					'YtLiveStatusSyncError',
					(err) => new SyncError({ message: err.message, cause: err.cause })
				),
				Effect.annotateLogs({
					ytChannelCount: ytChannelIds.length,
					...(taskName ? { taskName } : {})
				})
			);
		}).pipe(
			Effect.catchTags({
				CreatorCatalogError: (err) => new SyncError({ message: err.message, cause: err.cause })
			}),
			Effect.withSpan('SyncService.runYtLiveStatusSync')
		);
	});

	return {
		syncCreator,
		syncVideo,
		runCreatorSync,
		runVideoSync,
		runVideoBackfill,
		runTwitchLiveStatusSync,
		runYtLiveStatusSync
	} as const;
});

type SyncServiceShape = {
	syncCreator: (input: CreatorSyncInput) => Effect.Effect<void, SyncError, never>;
	syncVideo: (ytVideoId: string, taskName?: string) => Effect.Effect<void, SyncError, never>;
	runCreatorSync: (taskName?: string) => Effect.Effect<void, SyncError, never>;
	runVideoSync: (args: RunVideoSyncArgs) => Effect.Effect<void, SyncError, never>;
	runVideoBackfill: (taskName?: string) => Effect.Effect<void, SyncError, never>;
	runTwitchLiveStatusSync: (taskName?: string) => Effect.Effect<void, SyncError, never>;
	runYtLiveStatusSync: (taskName?: string) => Effect.Effect<void, SyncError, never>;
};

export class SyncService extends Context.Service<SyncService, SyncServiceShape>()(
	'@hc/content-sync/sync-service/SyncService',
	{ make: syncService }
) {
	static readonly layer = Layer.effect(this, this.make);
}
