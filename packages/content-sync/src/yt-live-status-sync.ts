import type { Video } from '@hc/db/schema';
import * as Clock from 'effect/Clock';
import * as Context from 'effect/Context';
import * as Data from 'effect/Data';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
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

			yield* Effect.logInfo(`${fullTaskName}Syncing Yt live status`);

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
								Effect.logWarning(
									`${fullTaskName}Failed to get livestream video IDs for ${ytChannelId}`,
									error
								).pipe(
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

			const videoDetailsMap = new Map<string, Omit<Video, 'isShort'>>();
			for (let i = 0; i < allCandidateVideoIds.length; i += 50) {
				const batch = allCandidateVideoIds.slice(i, i + 50);
				const batchDetails = yield* yt.getBatchVideoDetails(batch);
				for (const [videoId, details] of batchDetails.entries()) {
					videoDetailsMap.set(videoId, details);
				}
			}

			const upsertedVideoIds = new Set<string>();
			yield* Effect.forEach(
				videoDetailsMap.entries(),
				([ytVideoId, videoDetails]) =>
					db.upsertVideo({ ...videoDetails, isShort: false }).pipe(
						Effect.matchEffect({
							onSuccess: () =>
								Effect.sync(() => {
									upsertedVideoIds.add(ytVideoId);
								}),
							onFailure: (error) =>
								Effect.logError(
									`${fullTaskName}Failed to upsert live video ${ytVideoId}`,
									error
								).pipe(Effect.annotateLogs({ ytVideoId }))
						})
					),
				{ concurrency: 5 }
			);

			const updates = ytChannelIds.map((ytChannelId) => {
				const winner = chooseLiveVideoWinner(
					(candidateVideoIdsByChannel.get(ytChannelId) ?? [])
						.filter((videoId) => upsertedVideoIds.has(videoId))
						.map((videoId) => videoDetailsMap.get(videoId))
						.filter((video): video is Omit<Video, 'isShort'> => video !== undefined)
				);

				return {
					ytChannelId,
					ytLiveVideoId: winner?.ytVideoId ?? null
				};
			});

			yield* db.setYtLiveVideos(updates);

			const liveCount = updates.filter((update) => update.ytLiveVideoId !== null).length;
			const end = yield* Clock.currentTimeMillis;
			yield* Effect.logInfo(
				`YT LIVE SYNC COMPLETED: ${updates.length} channels synced, ${liveCount} currently live`
			);
			yield* Effect.logInfo(`YT LIVE SYNC TOOK ${end - start}ms`);
		}).pipe(
			Effect.catchTags({
				DbError: (err) =>
					new YtLiveStatusSyncError({
						message: `DB ERROR: ${err.message}`,
						cause: err.cause
					}),
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

			yield* db.setYtLiveVideos(updates);

			const liveCount = updates.filter((update) => update.ytLiveVideoId !== null).length;
			const end = yield* Clock.currentTimeMillis;
			yield* Effect.logInfo(
				`${fullTaskName}Recomputed Yt live status for ${updates.length} channels, ${liveCount} currently live`
			);
			yield* Effect.logInfo(`${fullTaskName}YT LIVE RECOMPUTE TOOK ${end - start}ms`);
		}).pipe(
			Effect.catchTags({
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
