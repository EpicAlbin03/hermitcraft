import type { Video } from '@hc/db/schema';
import * as Clock from 'effect/Clock';
import * as Context from 'effect/Context';
import * as Data from 'effect/Data';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { CreatorCatalog } from './creator-catalog';
import { DbService } from './db-service';
import { YtService } from './yt-service';

class YtLiveStatusSyncError extends Data.TaggedError('YtLiveStatusSyncError')<{
	message: string;
	cause?: unknown;
}> {}

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

const ytLiveStatusSync = Effect.gen(function* () {
	const creatorCatalog = yield* CreatorCatalog;
	const db = yield* DbService;
	const yt = yield* YtService;

	const refreshYtLiveStatus = Effect.fn('refreshYtLiveStatus')(function* (
		ytChannelIds: string[],
		taskName?: string
	) {
		return yield* Effect.gen(function* () {
			const start = yield* Clock.currentTimeMillis;
			const fullTaskName = taskName ? `${taskName}: ` : '';
			const candidateVideoIdsByChannel = new Map<string, string[]>();
			const allCandidateVideoIds: string[] = [];
			const allCandidateVideoIdsSet = new Set<string>();

			yield* Effect.logInfo(`${fullTaskName}Refreshing YouTube Live Video`);

			yield* Effect.forEach(
				ytChannelIds,
				(ytChannelId) =>
					yt.getLiveStreamVideoIds(ytChannelId, 5).pipe(
						Effect.matchEffect({
							onSuccess: (videoIds) =>
								Effect.sync(() => {
									candidateVideoIdsByChannel.set(ytChannelId, videoIds);
									for (const videoId of videoIds) {
										if (allCandidateVideoIdsSet.has(videoId)) continue;
										allCandidateVideoIds.push(videoId);
										allCandidateVideoIdsSet.add(videoId);
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

			const candidateVideoDetails = new Map<string, Omit<Video, 'isShort'>>();
			for (let i = 0; i < allCandidateVideoIds.length; i += 50) {
				const batch = allCandidateVideoIds.slice(i, i + 50);
				const batchDetails = yield* yt.getBatchVideoDetails(batch);
				for (const [videoId, details] of batchDetails.entries()) {
					candidateVideoDetails.set(videoId, details);
				}
			}

			const storedCandidateVideoIds = new Set<string>();
			yield* Effect.forEach(
				candidateVideoDetails.entries(),
				([ytVideoId, videoDetails]) =>
					db.upsertVideo({ ...videoDetails, isShort: false }).pipe(
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
						.filter((videoId) => storedCandidateVideoIds.has(videoId))
						.map((videoId) => candidateVideoDetails.get(videoId))
						.filter((video): video is Omit<Video, 'isShort'> => video !== undefined)
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
					new YtLiveStatusSyncError({ message: err.message, cause: err.cause }),
				YtError: (err) =>
					new YtLiveStatusSyncError({
						message: `YT ERROR: ${err.message}`,
						cause: err.cause
					})
			}),
			Effect.annotateLogs({
				ytChannelCount: ytChannelIds.length,
				...(taskName ? { taskName } : {})
			}),
			Effect.withSpan('YtLiveStatusSync.refreshYtLiveStatus')
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
					new YtLiveStatusSyncError({ message: err.message, cause: err.cause }),
				DbError: (err) =>
					new YtLiveStatusSyncError({
						message: `DB ERROR: ${err.message}`,
						cause: err.cause
					})
			}),
			Effect.annotateLogs({
				ytChannelCount: ytChannelIds.length,
				...(taskName ? { taskName } : {})
			}),
			Effect.withSpan('YtLiveStatusSync.recomputeYtLiveStatus')
		);
	});

	return {
		refreshYtLiveStatus,
		recomputeYtLiveStatus
	} as const;
});

type YtLiveStatusSyncShape = Effect.Success<typeof ytLiveStatusSync>;

export class YtLiveStatusSync extends Context.Service<YtLiveStatusSync, YtLiveStatusSyncShape>()(
	'@hc/content-sync/yt-live-status-sync/YtLiveStatusSync',
	{
		make: ytLiveStatusSync
	}
) {
	static readonly layer = Layer.effect(this, this.make);
}
