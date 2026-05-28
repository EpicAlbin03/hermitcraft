import type { Video } from '@hc/db/schema';
import * as Clock from 'effect/Clock';
import * as Context from 'effect/Context';
import * as Data from 'effect/Data';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Ref from 'effect/Ref';
import { DbService } from './db-service';
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

const isStorableVideo = (video: Omit<Video, 'isShort'>) => {
	const isLiveOrUpcoming = video.livestreamType === 'live' || video.livestreamType === 'upcoming';

	return (video.durationSeconds !== null && video.durationSeconds > 0) || isLiveOrUpcoming;
};

const videoSync = Effect.gen(function* () {
	const db = yield* DbService;
	const yt = yield* YtService;

	const getBatchVideoDetails = Effect.fn('getBatchVideoDetails')(function* (ytVideoIds: string[]) {
		const videoDetails = new Map<string, Omit<Video, 'isShort'>>();

		for (let i = 0; i < ytVideoIds.length; i += 50) {
			const batch = ytVideoIds.slice(i, i + 50);
			const batchDetails = yield* yt.getBatchVideoDetails(batch);
			for (const [ytVideoId, details] of batchDetails.entries()) {
				videoDetails.set(ytVideoId, details);
			}
		}

		return videoDetails;
	});

	const observeLiveCandidateVideos = Effect.fn('observeLiveCandidateVideos')(function* (
		ytChannelIds: string[],
		taskName?: string
	) {
		const fullTaskName = taskName ? `${taskName}: ` : '';
		const candidateVideoIdsByChannel = new Map<string, string[]>();
		const allCandidateVideoIds: string[] = [];
		const allCandidateVideoIdsSet = new Set<string>();

		yield* Effect.forEach(
			ytChannelIds,
			(ytChannelId) =>
				yt.getLiveStreamVideoIds(ytChannelId, 5).pipe(
					Effect.matchEffect({
						onSuccess: (videoIds) =>
							Effect.sync(() => {
								candidateVideoIdsByChannel.set(ytChannelId, videoIds);
								for (const ytVideoId of videoIds) {
									if (allCandidateVideoIdsSet.has(ytVideoId)) continue;
									allCandidateVideoIds.push(ytVideoId);
									allCandidateVideoIdsSet.add(ytVideoId);
								}
							}),
						onFailure: (error) =>
							Effect.logWarning(`${fullTaskName}Failed to get livestream video IDs`, error).pipe(
								Effect.annotateLogs({ ytChannelId }),
								Effect.andThen(
									Effect.sync(() => {
										candidateVideoIdsByChannel.set(ytChannelId, []);
									})
								)
							)
					})
				),
			{ concurrency: 5 }
		);

		const candidateVideoDetails = yield* getBatchVideoDetails(allCandidateVideoIds);
		const upsertableVideos = new Map<string, Video>();

		for (const [ytVideoId, videoDetails] of candidateVideoDetails.entries()) {
			if (!isStorableVideo(videoDetails)) continue;
			upsertableVideos.set(ytVideoId, { ...videoDetails, isShort: false });
		}

		return {
			candidateVideoIdsByChannel,
			upsertableVideos
		} as const;
	});

	const observeVideosForSync = Effect.fn('observeVideosForSync')(function* (
		ytChannelIds: string[],
		currentYtLiveVideoIdsByChannel: Map<string, string>,
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

		const observedVideoIdsSet = new Set(observedVideoIds);
		for (const ytChannelId of ytChannelIds) {
			const liveVideoId = currentYtLiveVideoIdsByChannel.get(ytChannelId);
			if (!liveVideoId || observedVideoIdsSet.has(liveVideoId)) continue;

			observedVideoIds.push(liveVideoId);
			observedVideoIdsSet.add(liveVideoId);
			const creatorVideos = videoIdsByCreator.get(ytChannelId) ?? [];
			creatorVideos.push(liveVideoId);
			videoIdsByCreator.set(ytChannelId, creatorVideos);
		}

		const existingVideos = yield* db.getVideos(observedVideoIds);
		const existingVideoIds = new Set(existingVideos.map((video) => video.ytVideoId));
		const observedVideoDetails = yield* getBatchVideoDetails(observedVideoIds);
		const missingExistingVideoIds: string[] = [];
		for (const ytVideoId of observedVideoIds) {
			if (!observedVideoDetails.has(ytVideoId) && existingVideoIds.has(ytVideoId)) {
				missingExistingVideoIds.push(ytVideoId);
			}
		}

		const observedShortsMap = new Map(
			existingVideos.map((video) => [video.ytVideoId, video.isShort])
		);
		yield* Effect.forEach(
			ytChannelIds,
			(ytChannelId) => {
				const videoIds = videoIdsByCreator.get(ytChannelId) ?? [];
				const newVideoIds = videoIds.filter((ytVideoId) => !existingVideoIds.has(ytVideoId));
				if (newVideoIds.length === 0) return Effect.void;

				return yt.areVideosShorts(newVideoIds, ytChannelId, args.maxResults).pipe(
					Effect.catchTag('YtError', (error) =>
						Effect.logWarning(`${fullTaskName}${error.message}, marking all as non-shorts`).pipe(
							Effect.as(new Map<string, boolean>())
						)
					),
					Effect.tap((shortsMap) =>
						Effect.sync(() => {
							for (const [ytVideoId, isShort] of shortsMap.entries()) {
								observedShortsMap.set(ytVideoId, isShort);
							}
						})
					)
				);
			},
			{ concurrency: 5 }
		);

		const upsertableVideos = new Map<string, Video>();
		const skippedVideoIds: string[] = [];
		for (const [ytVideoId, videoDetails] of observedVideoDetails.entries()) {
			if (!isStorableVideo(videoDetails)) {
				skippedVideoIds.push(ytVideoId);
				continue;
			}

			upsertableVideos.set(ytVideoId, {
				...videoDetails,
				isShort: observedShortsMap.get(ytVideoId) ?? false
			});
		}

		return {
			upsertableVideos,
			skippedVideoIds,
			missingExistingVideoIds
		} as const;
	});

	const refreshYtLiveStatus = Effect.fn('refreshYtLiveStatus')(function* (
		ytChannelIds: string[],
		taskName?: string
	) {
		return yield* Effect.gen(function* () {
			const start = yield* Clock.currentTimeMillis;
			const fullTaskName = taskName ? `${taskName}: ` : '';
			yield* Effect.logInfo(`${fullTaskName}Refreshing YouTube Live Video`);
			const { candidateVideoIdsByChannel, upsertableVideos } = yield* observeLiveCandidateVideos(
				ytChannelIds,
				taskName
			);

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

			const liveCount = ytChannelIds.filter((ytChannelId) =>
				(candidateVideoIdsByChannel.get(ytChannelId) ?? []).some((ytVideoId) =>
					storedCandidateVideoIds.has(ytVideoId)
				)
			).length;
			const end = yield* Clock.currentTimeMillis;
			yield* Effect.logInfo(
				`YOUTUBE LIVE VIDEO REFRESH COMPLETED: ${ytChannelIds.length} creators synced, ${liveCount} currently live`
			);
			yield* Effect.logInfo(`YOUTUBE LIVE VIDEO REFRESH TOOK ${end - start}ms`);
		}).pipe(
			Effect.catchTag(
				'YtError',
				(err) => new VideoSyncError({ message: `YT ERROR: ${err.message}`, cause: err.cause })
			),
			Effect.annotateLogs({
				ytChannelCount: ytChannelIds.length,
				...(taskName ? { taskName } : {})
			}),
			Effect.withSpan('VideoSync.refreshYtLiveStatus')
		);
	});

	const syncVideosForCreators = Effect.fn('syncVideosForCreators')(function* (
		ytChannelIds: string[],
		args: VideoSyncArgs
	) {
		return yield* Effect.gen(function* () {
			const start = yield* Clock.currentTimeMillis;
			const counts = yield* Ref.make({ successCount: 0, errorCount: 0, skipCount: 0 });
			const fullTaskName = args.taskName ? `${args.taskName}: ` : '';
			const currentYtLiveVideos = yield* db.getCurrentYtLiveVideosByCreators(ytChannelIds);
			const currentYtLiveVideoIdsByChannel = new Map(
				currentYtLiveVideos.map((video) => [video.ytChannelId, video.ytVideoId])
			);
			const { upsertableVideos, skippedVideoIds, missingExistingVideoIds } =
				yield* observeVideosForSync(ytChannelIds, currentYtLiveVideoIdsByChannel, args);

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

			const { successCount, errorCount, skipCount } = yield* Ref.get(counts);
			const end = yield* Clock.currentTimeMillis;
			yield* Effect.logInfo(
				`VIDEO SYNC COMPLETED: ${successCount} videos synced, ${errorCount} videos failed, ${skipCount} videos skipped`
			);
			yield* Effect.logInfo(`VIDEO SYNC TOOK ${end - start}ms`);
		}).pipe(
			Effect.catchTags({
				DbError: (err) =>
					new VideoSyncError({ message: `DB ERROR: ${err.message}`, cause: err.cause }),
				YtError: (err) =>
					new VideoSyncError({ message: `YT ERROR: ${err.message}`, cause: err.cause })
			}),
			Effect.annotateLogs({
				ytChannelCount: ytChannelIds.length,
				...(args.taskName ? { taskName: args.taskName } : {})
			}),
			Effect.withSpan('VideoSync.syncVideosForCreators')
		);
	});

	return {
		refreshYtLiveStatus,
		syncVideosForCreators
	} as const;
});

type VideoSyncShape = Effect.Success<typeof videoSync>;

export class VideoSync extends Context.Service<VideoSync, VideoSyncShape>()(
	'@hc/content-sync/video-sync/VideoSync',
	{ make: videoSync }
) {
	static readonly layer = Layer.effect(this, this.make);
}
