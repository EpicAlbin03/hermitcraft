import type { Video } from '@hc/db/schema';
import * as Clock from 'effect/Clock';
import * as Context from 'effect/Context';
import * as Data from 'effect/Data';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Ref from 'effect/Ref';
import { CreatorCatalog } from './creator-catalog';
import { DbService } from './db-service';
import { YtObservedVideos } from './yt-observed-videos';

class VideoSyncError extends Data.TaggedError('VideoSyncError')<{
	message: string;
	cause?: unknown;
}> {}

export type VideoSyncArgs = {
	taskName?: string;
	backfill?: boolean;
	maxResults?: number;
};

const getVideoSortTime = (
	video: Pick<Video, 'livestreamActualStartTime' | 'livestreamScheduledStartTime' | 'publishedAt'>
) =>
	(
		video.livestreamActualStartTime ??
		video.livestreamScheduledStartTime ??
		video.publishedAt
	).getTime();

const chooseLiveVideoWinner = (
	videos: Pick<
		Video,
		| 'ytVideoId'
		| 'privacyStatus'
		| 'livestreamType'
		| 'livestreamActualStartTime'
		| 'livestreamScheduledStartTime'
		| 'publishedAt'
	>[]
) =>
	videos
		.filter((video) => video.livestreamType === 'live' && video.privacyStatus === 'public')
		.toSorted((a, b) => getVideoSortTime(b) - getVideoSortTime(a))
		.at(0) ?? null;

const videoSync = Effect.gen(function* () {
	const creatorCatalog = yield* CreatorCatalog;
	const db = yield* DbService;
	const ytObservedVideos = yield* YtObservedVideos;

	const refreshYtLiveStatus = Effect.fn('refreshYtLiveStatus')(function* (
		ytChannelIds: string[],
		taskName?: string
	) {
		return yield* Effect.gen(function* () {
			const start = yield* Clock.currentTimeMillis;
			const fullTaskName = taskName ? `${taskName}: ` : '';
			yield* Effect.logInfo(`${fullTaskName}Refreshing YouTube Live Video`);
			const { candidateVideoIdsByChannel, upsertableVideos } =
				yield* ytObservedVideos.observeLiveCandidateVideos(ytChannelIds, taskName);

			const storedCandidateVideoIds = new Set<string>();
			yield* Effect.forEach(
				upsertableVideos.entries(),
				([ytVideoId, videoDetails]) =>
					db.upsertVideo(videoDetails).pipe(
						Effect.matchEffect({
							onSuccess: () =>
								Effect.sync(() => {
									storedCandidateVideoIds.add(ytVideoId);
								}),
							onFailure: (error) =>
								Effect.logError(`${fullTaskName}Failed to upsert live video`, error).pipe(
									Effect.annotateLogs({ ytVideoId })
								)
						})
					),
				{ concurrency: 5 }
			);

			const updates = ytChannelIds.map((ytChannelId) => {
				const winner = chooseLiveVideoWinner(
					(candidateVideoIdsByChannel.get(ytChannelId) ?? [])
						.filter((ytVideoId) => storedCandidateVideoIds.has(ytVideoId))
						.map((ytVideoId) => upsertableVideos.get(ytVideoId))
						.filter((video): video is Video => video !== undefined)
				);

				return {
					ytChannelId,
					ytLiveVideoId: winner?.ytVideoId ?? null
				};
			});

			yield* creatorCatalog.setTrackedCreatorYtLiveVideos(updates);

			const liveCount = updates.filter((update) => update.ytLiveVideoId !== null).length;
			const end = yield* Clock.currentTimeMillis;
			yield* Effect.logInfo(
				`YOUTUBE LIVE VIDEO REFRESH COMPLETED: ${updates.length} creators synced, ${liveCount} currently live`
			);
			yield* Effect.logInfo(`YOUTUBE LIVE VIDEO REFRESH TOOK ${end - start}ms`);
		}).pipe(
			Effect.catchTags({
				CreatorCatalogError: (err) =>
					new VideoSyncError({ message: err.message, cause: err.cause }),
				YtError: (err) =>
					new VideoSyncError({ message: `YT ERROR: ${err.message}`, cause: err.cause })
			}),
			Effect.annotateLogs({
				ytChannelCount: ytChannelIds.length,
				...(taskName ? { taskName } : {})
			}),
			Effect.withSpan('VideoSync.refreshYtLiveStatus')
		);
	});

	const recomputeYtLiveStatus = Effect.fn('recomputeYtLiveStatus')(function* (
		ytChannelIds: string[],
		taskName?: string
	) {
		return yield* Effect.gen(function* () {
			if (ytChannelIds.length === 0) return;

			const start = yield* Clock.currentTimeMillis;
			const fullTaskName = taskName ? `${taskName}: ` : '';
			const liveVideos = yield* db.getPublicLiveVideosByChannels(ytChannelIds);
			const liveVideosByChannel = new Map<string, Video[]>();

			for (const liveVideo of liveVideos) {
				const existingVideos = liveVideosByChannel.get(liveVideo.ytChannelId) ?? [];
				existingVideos.push(liveVideo);
				liveVideosByChannel.set(liveVideo.ytChannelId, existingVideos);
			}

			const updates = ytChannelIds.map((ytChannelId) => ({
				ytChannelId,
				ytLiveVideoId:
					chooseLiveVideoWinner(liveVideosByChannel.get(ytChannelId) ?? [])?.ytVideoId ?? null
			}));

			yield* creatorCatalog.setTrackedCreatorYtLiveVideos(updates);

			const liveCount = updates.filter((update) => update.ytLiveVideoId !== null).length;
			const end = yield* Clock.currentTimeMillis;
			yield* Effect.logInfo(
				`${fullTaskName}Recomputed YouTube Live Video for ${updates.length} creators, ${liveCount} currently live`
			);
			yield* Effect.logInfo(`${fullTaskName}YOUTUBE LIVE VIDEO RECOMPUTE TOOK ${end - start}ms`);
		}).pipe(
			Effect.catchTags({
				CreatorCatalogError: (err) =>
					new VideoSyncError({ message: err.message, cause: err.cause }),
				DbError: (err) =>
					new VideoSyncError({
						message: `DB ERROR: ${err.message}`,
						cause: err.cause
					})
			}),
			Effect.annotateLogs({
				ytChannelCount: ytChannelIds.length,
				...(taskName ? { taskName } : {})
			}),
			Effect.withSpan('VideoSync.recomputeYtLiveStatus')
		);
	});

	const syncVideosForChannels = Effect.fn('syncVideosForChannels')(function* (
		ytChannelIds: string[],
		args: VideoSyncArgs
	) {
		return yield* Effect.gen(function* () {
			const start = yield* Clock.currentTimeMillis;
			const counts = yield* Ref.make({ successCount: 0, errorCount: 0, skipCount: 0 });
			const fullTaskName = args.taskName ? `${args.taskName}: ` : '';
			const creators = yield* creatorCatalog.listTrackedCreatorsByIds(ytChannelIds);
			const creatorLiveVideoIdsByChannel = new Map(
				creators.map((creator) => [creator.ytChannelId, creator.ytLiveVideoId])
			);
			const { upsertableVideos, skippedVideoIds, missingExistingVideoIds } =
				yield* ytObservedVideos.observeVideosForSync({
					ytChannelIds,
					creatorLiveVideoIdsByChannel,
					...(args.backfill !== undefined ? { backfill: args.backfill } : {}),
					...(args.maxResults !== undefined ? { maxResults: args.maxResults } : {}),
					...(args.taskName !== undefined ? { taskName: args.taskName } : {})
				});

			if (missingExistingVideoIds.length > 0) {
				const markedCount = yield* db.markVideosAsPrivate(missingExistingVideoIds);
				yield* Effect.logInfo(
					`${fullTaskName}Marked ${markedCount} videos as private (no longer accessible via API)`
				);
			}

			if (skippedVideoIds.length > 0) {
				yield* Ref.update(counts, ({ successCount, errorCount, skipCount }) => ({
					successCount,
					errorCount,
					skipCount: skipCount + skippedVideoIds.length
				}));
				yield* Effect.forEach(
					skippedVideoIds,
					(ytVideoId) =>
						Effect.logWarning(`${fullTaskName}Skipped video`).pipe(
							Effect.annotateLogs({ ytVideoId })
						),
					{ concurrency: 'unbounded' }
				);
			}

			yield* Effect.logInfo(`${fullTaskName}Syncing videos`);
			yield* Effect.forEach(
				upsertableVideos.entries(),
				([ytVideoId, videoDetails]) =>
					db.upsertVideo(videoDetails).pipe(
						Effect.matchEffect({
							onSuccess: () =>
								Ref.update(counts, ({ successCount, errorCount, skipCount }) => ({
									successCount: successCount + 1,
									errorCount,
									skipCount
								})),
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

			yield* recomputeYtLiveStatus(ytChannelIds, args.taskName);

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
					new VideoSyncError({ message: `YT ERROR: ${err.message}`, cause: err.cause })
			}),
			Effect.annotateLogs({
				ytChannelCount: ytChannelIds.length,
				...(args.taskName ? { taskName: args.taskName } : {})
			}),
			Effect.withSpan('VideoSync.syncVideosForChannels')
		);
	});

	return {
		refreshYtLiveStatus,
		recomputeYtLiveStatus,
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
