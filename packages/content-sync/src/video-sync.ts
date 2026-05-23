import type { Video } from '@hc/db/schema';
import * as Clock from 'effect/Clock';
import * as Context from 'effect/Context';
import * as Data from 'effect/Data';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Ref from 'effect/Ref';
import { CreatorCatalog } from './creator-catalog';
import { DbService } from './db-service';
import { YtLiveStatusSync } from './yt-live-status-sync';
import { YtService } from './yt-service';

class VideoSyncError extends Data.TaggedError('VideoSyncError')<{
	message: string;
	cause?: unknown;
}> {}

export type VideoSyncArgs = {
	taskName?: string;
	backfill?: boolean;
	maxResults?: number;
};

const videoSync = Effect.gen(function* () {
	const creatorCatalog = yield* CreatorCatalog;
	const db = yield* DbService;
	const yt = yield* YtService;
	const ytLiveStatusSync = yield* YtLiveStatusSync;

	const discoverObservedVideos = Effect.fn('discoverObservedVideos')(function* (
		ytChannelIds: string[],
		args: VideoSyncArgs
	) {
		const fullTaskName = args.taskName ? `${args.taskName}: ` : '';
		const videoIdsByCreator = new Map<string, string[]>();
		const observedVideoIds: string[] = [];

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
								videoIdsByCreator.set(ytChannelId, videoIds);
								observedVideoIds.push(...videoIds);
							}),
						onFailure: (error) =>
							Effect.logError(`${fullTaskName}Failed to get video IDs`, error).pipe(
								Effect.annotateLogs({ ytChannelId })
							)
					})
				),
			{ concurrency: 5 }
		);

		const creators = yield* creatorCatalog.listTrackedCreatorsByIds(ytChannelIds);
		const observedVideoIdsSet = new Set(observedVideoIds);
		for (const creator of creators) {
			if (creator.ytLiveVideoId && !observedVideoIdsSet.has(creator.ytLiveVideoId)) {
				observedVideoIds.push(creator.ytLiveVideoId);
				observedVideoIdsSet.add(creator.ytLiveVideoId);
				const creatorVideos = videoIdsByCreator.get(creator.ytChannelId) ?? [];
				creatorVideos.push(creator.ytLiveVideoId);
				videoIdsByCreator.set(creator.ytChannelId, creatorVideos);
			}
		}

		return { videoIdsByCreator, observedVideoIds } as const;
	});

	const reconcileObservedVideos = Effect.fn('reconcileObservedVideos')(function* (
		videoIdsByCreator: Map<string, string[]>,
		observedVideoIds: string[],
		args: VideoSyncArgs
	) {
		const fullTaskName = args.taskName ? `${args.taskName}: ` : '';
		const existingVideos = yield* db.getVideos(observedVideoIds);
		const existingVideoIds = new Set(existingVideos.map((video) => video.ytVideoId));
		const existingShortsMap = new Map(
			existingVideos.map((video) => [video.ytVideoId, video.isShort])
		);
		const observedVideoDetails = new Map<string, Omit<Video, 'isShort'>>();
		const missingVideoIds: string[] = [];

		for (let i = 0; i < observedVideoIds.length; i += 50) {
			const batch = observedVideoIds.slice(i, i + 50);
			const batchDetails = yield* yt.getBatchVideoDetails(batch);
			for (const [id, details] of batchDetails.entries()) {
				observedVideoDetails.set(id, details);
			}
			for (const id of batch) {
				if (!batchDetails.has(id) && existingVideoIds.has(id)) {
					missingVideoIds.push(id);
				}
			}
		}

		if (missingVideoIds.length > 0) {
			const markedCount = yield* db.markVideosAsPrivate(missingVideoIds);
			yield* Effect.logInfo(
				`${fullTaskName}Marked ${markedCount} videos as private (no longer accessible via API)`
			);
		}

		const observedShortsMap = new Map<string, boolean>(existingShortsMap);
		const ytChannelIds = Array.from(videoIdsByCreator.keys());
		yield* Effect.forEach(
			ytChannelIds,
			(ytChannelId) => {
				const videoIds = videoIdsByCreator.get(ytChannelId) ?? [];
				const newVideoIds = videoIds.filter((id) => !existingVideoIds.has(id));
				if (newVideoIds.length === 0) return Effect.void;

				return yt.areVideosShorts(newVideoIds, ytChannelId, args.maxResults).pipe(
					Effect.catchTag('YtError', (error) =>
						Effect.logWarning(`${fullTaskName}${error.message}, marking all as non-shorts`).pipe(
							Effect.as(new Map<string, boolean>())
						)
					),
					Effect.tap((shortsMap) =>
						Effect.sync(() => {
							for (const [id, isShort] of shortsMap.entries()) {
								observedShortsMap.set(id, isShort);
							}
						})
					)
				);
			},
			{ concurrency: 5 }
		);

		return { observedVideoDetails, observedShortsMap } as const;
	});

	const syncVideosForChannels = Effect.fn('syncVideosForChannels')(function* (
		ytChannelIds: string[],
		args: VideoSyncArgs
	) {
		return yield* Effect.gen(function* () {
			const start = yield* Clock.currentTimeMillis;
			const counts = yield* Ref.make({ successCount: 0, errorCount: 0, skipCount: 0 });
			const fullTaskName = args.taskName ? `${args.taskName}: ` : '';
			const { videoIdsByCreator, observedVideoIds } = yield* discoverObservedVideos(
				ytChannelIds,
				args
			);
			const { observedVideoDetails, observedShortsMap } = yield* reconcileObservedVideos(
				videoIdsByCreator,
				observedVideoIds,
				args
			);

			yield* Effect.logInfo(`${fullTaskName}Syncing videos`);
			yield* Effect.forEach(
				observedVideoDetails.entries(),
				([ytVideoId, videoDetails]) =>
					db
						.upsertVideo({
							...videoDetails,
							isShort: observedShortsMap.get(ytVideoId) ?? false
						})
						.pipe(
							Effect.matchEffect({
								onSuccess: (result) => {
									if (result.wasSkipped) {
										return Ref.update(counts, ({ successCount, errorCount, skipCount }) => ({
											successCount,
											errorCount,
											skipCount: skipCount + 1
										})).pipe(
											Effect.andThen(
												Effect.logWarning(`${fullTaskName}Skipped video`).pipe(
													Effect.annotateLogs({ ytVideoId })
												)
											)
										);
									}

									return Ref.update(counts, ({ successCount, errorCount, skipCount }) => ({
										successCount: successCount + 1,
										errorCount,
										skipCount
									}));
								},
								onFailure: (error) =>
									Ref.update(counts, ({ successCount, errorCount, skipCount }) => ({
										successCount,
										errorCount: errorCount + 1,
										skipCount
									})).pipe(
										Effect.andThen(
											Effect.logError(`${fullTaskName}Failed to sync video`, error).pipe(
												Effect.annotateLogs({ ytVideoId })
											)
										)
									)
							})
						),
				{ concurrency: 5 }
			);

			yield* ytLiveStatusSync.recomputeYtLiveStatus(ytChannelIds, args.taskName);

			const { successCount, errorCount, skipCount } = yield* Ref.get(counts);
			const end = yield* Clock.currentTimeMillis;
			yield* Effect.logInfo(
				`VIDEO SYNC COMPLETED: ${successCount} videos synced, ${errorCount} videos failed, ${skipCount} videos skipped`
			);
			yield* Effect.logInfo(`VIDEO SYNC TOOK ${end - start}ms`);
		}).pipe(
			Effect.catchTags({
				CreatorCatalogError: (err) =>
					new VideoSyncError({ message: err.message, cause: err.cause }),
				DbError: (err) =>
					new VideoSyncError({ message: `DB ERROR: ${err.message}`, cause: err.cause }),
				YtError: (err) =>
					new VideoSyncError({ message: `YT ERROR: ${err.message}`, cause: err.cause }),
				YtLiveStatusSyncError: (err) =>
					new VideoSyncError({ message: err.message, cause: err.cause })
			}),
			Effect.annotateLogs({
				ytChannelCount: ytChannelIds.length,
				...(args.taskName ? { taskName: args.taskName } : {})
			}),
			Effect.withSpan('VideoSync.syncVideosForChannels')
		);
	});

	return {
		syncVideosForChannels
	} as const;
});

type VideoSyncShape = Effect.Success<typeof videoSync>;

export class VideoSync extends Context.Service<VideoSync, VideoSyncShape>()(
	'@hc/content-sync/video-sync/VideoSync',
	{ make: videoSync }
) {
	static readonly layer = Layer.effect(this, this.make);
}
