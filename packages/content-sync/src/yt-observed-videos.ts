import type { Video } from '@hc/db/schema';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { DbError, DbService } from './db-service';
import { parseIsoDurationToSeconds } from './utils';
import { YtError, YtService } from './yt-service';

type ObservedVideo = Omit<Video, 'isShort'>;
type StoredVideo = Video;

type ObserveVideoSyncArgs = {
	ytChannelIds: string[];
	creatorLiveVideoIdsByChannel: Map<string, string | null>;
	backfill?: boolean;
	maxResults?: number;
	taskName?: string;
};

const isStorableVideo = (video: ObservedVideo) => {
	const durationSeconds = parseIsoDurationToSeconds(video.duration);
	const isLiveOrUpcoming = video.livestreamType === 'live' || video.livestreamType === 'upcoming';

	return (durationSeconds !== null && durationSeconds > 0) || isLiveOrUpcoming;
};

const ytObservedVideos = Effect.gen(function* () {
	const db = yield* DbService;
	const yt = yield* YtService;

	const getBatchVideoDetails = Effect.fn('getBatchVideoDetails')(function* (ytVideoIds: string[]) {
		const videoDetails = new Map<string, ObservedVideo>();

		for (let i = 0; i < ytVideoIds.length; i += 50) {
			const batch = ytVideoIds.slice(i, i + 50);
			const batchDetails = yield* yt.getBatchVideoDetails(batch);
			for (const [ytVideoId, details] of batchDetails.entries()) {
				videoDetails.set(ytVideoId, details);
			}
		}

		return videoDetails;
	});

	const observeVideosForSync = Effect.fn('observeVideosForSync')(function* (
		args: ObserveVideoSyncArgs
	) {
		const fullTaskName = args.taskName ? `${args.taskName}: ` : '';
		const videoIdsByCreator = new Map<string, string[]>();
		const observedVideoIds: string[] = [];

		yield* Effect.forEach(
			args.ytChannelIds,
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
		for (const ytChannelId of args.ytChannelIds) {
			const liveVideoId = args.creatorLiveVideoIdsByChannel.get(ytChannelId);
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
			args.ytChannelIds,
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

		const upsertableVideos = new Map<string, StoredVideo>();
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
		const upsertableVideos = new Map<string, StoredVideo>();

		for (const [ytVideoId, videoDetails] of candidateVideoDetails.entries()) {
			if (!isStorableVideo(videoDetails)) continue;
			upsertableVideos.set(ytVideoId, { ...videoDetails, isShort: false });
		}

		return {
			candidateVideoIdsByChannel,
			upsertableVideos
		} as const;
	});

	return {
		observeVideosForSync,
		observeLiveCandidateVideos
	} as const;
});

type YtObservedVideosShape = {
	observeVideosForSync: (args: ObserveVideoSyncArgs) => Effect.Effect<
		{
			upsertableVideos: Map<string, StoredVideo>;
			skippedVideoIds: string[];
			missingExistingVideoIds: string[];
		},
		DbError | YtError,
		never
	>;
	observeLiveCandidateVideos: (
		ytChannelIds: string[],
		taskName?: string
	) => Effect.Effect<
		{
			candidateVideoIdsByChannel: Map<string, string[]>;
			upsertableVideos: Map<string, StoredVideo>;
		},
		YtError,
		never
	>;
};

export class YtObservedVideos extends Context.Service<YtObservedVideos, YtObservedVideosShape>()(
	'@hc/content-sync/yt-observed-videos/YtObservedVideos',
	{ make: ytObservedVideos }
) {
	static readonly layer = Layer.effect(this, this.make);
}
