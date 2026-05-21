import type { Video } from '@hc/db/schema';
import * as Clock from 'effect/Clock';
import * as Context from 'effect/Context';
import * as Data from 'effect/Data';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Ref from 'effect/Ref';
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
	const db = yield* DbService;
	const yt = yield* YtService;
	const ytLiveStatusSync = yield* YtLiveStatusSync;

	const discoverVideoIds = Effect.fn('discoverVideoIds')(function* (
		ytChannelIds: string[],
		args: VideoSyncArgs
	) {
		const fullTaskName = args.taskName ? `${args.taskName}: ` : '';
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

		const channelsWithLive = yield* db.getAllChannels();
		const allVideoIdsSet = new Set(allVideoIds);
		for (const channel of channelsWithLive) {
			if (channel.ytLiveVideoId && !allVideoIdsSet.has(channel.ytLiveVideoId)) {
				allVideoIds.push(channel.ytLiveVideoId);
				allVideoIdsSet.add(channel.ytLiveVideoId);
				const channelVideos = videosByChannel.get(channel.ytChannelId) ?? [];
				channelVideos.push(channel.ytLiveVideoId);
				videosByChannel.set(channel.ytChannelId, channelVideos);
			}
		}

		return { videosByChannel, allVideoIds } as const;
	});

	const reconcileObservedVideos = Effect.fn('reconcileObservedVideos')(function* (
		videosByChannel: Map<string, string[]>,
		allVideoIds: string[],
		args: VideoSyncArgs
	) {
		const fullTaskName = args.taskName ? `${args.taskName}: ` : '';
		const existingVideos = yield* db.getVideos(allVideoIds);
		const existingVideoIds = new Set(existingVideos.map((video) => video.ytVideoId));
		const existingShortsMap = new Map(
			existingVideos.map((video) => [video.ytVideoId, video.isShort])
		);
		const allVideoDetailsMap = new Map<string, Omit<Video, 'isShort'>>();
		const missingVideoIds: string[] = [];

		for (let i = 0; i < allVideoIds.length; i += 50) {
			const batch = allVideoIds.slice(i, i + 50);
			const batchDetails = yield* yt.getBatchVideoDetails(batch);
			for (const [id, details] of batchDetails.entries()) {
				allVideoDetailsMap.set(id, details);
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

		const allShortsMap = new Map<string, boolean>(existingShortsMap);
		const ytChannelIds = Array.from(videosByChannel.keys());
		yield* Effect.forEach(
			ytChannelIds,
			(ytChannelId) => {
				const videoIds = videosByChannel.get(ytChannelId) ?? [];
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
								allShortsMap.set(id, isShort);
							}
						})
					)
				);
			},
			{ concurrency: 5 }
		);

		return { allVideoDetailsMap, allShortsMap } as const;
	});

	const syncVideosForChannels = Effect.fn('syncVideosForChannels')(function* (
		ytChannelIds: string[],
		args: VideoSyncArgs
	) {
		return yield* Effect.gen(function* () {
			const start = yield* Clock.currentTimeMillis;
			const counts = yield* Ref.make({ successCount: 0, errorCount: 0, skipCount: 0 });
			const fullTaskName = args.taskName ? `${args.taskName}: ` : '';
			const { videosByChannel, allVideoIds } = yield* discoverVideoIds(ytChannelIds, args);
			const { allVideoDetailsMap, allShortsMap } = yield* reconcileObservedVideos(
				videosByChannel,
				allVideoIds,
				args
			);

			yield* Effect.logInfo(`${fullTaskName}Syncing videos`);
			yield* Effect.forEach(
				allVideoDetailsMap.entries(),
				([ytVideoId, videoDetails]) =>
					db.upsertVideo({ ...videoDetails, isShort: allShortsMap.get(ytVideoId) ?? false }).pipe(
						Effect.matchEffect({
							onSuccess: (result) => {
								if (result.wasSkipped) {
									return Ref.update(counts, ({ successCount, errorCount, skipCount }) => ({
										successCount,
										errorCount,
										skipCount: skipCount + 1
									})).pipe(
										Effect.andThen(
											Effect.logWarning(`${fullTaskName}Skipped video ${ytVideoId}`).pipe(
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
										Effect.logError(`${fullTaskName}Failed to sync video ${ytVideoId}`, error).pipe(
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
