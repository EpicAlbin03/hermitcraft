import type { ChannelLink, Video } from '@hc/db/schema';
import * as Context from 'effect/Context';
import * as Data from 'effect/Data';
import * as Effect from 'effect/Effect';
import { DbService } from './db-service';
import { TwitchService } from './twitch-service';
import { YoutubeService } from './yt-service';

class SyncError extends Data.TaggedError('SyncError')<{ message: string; cause?: unknown }> {}

type SyncChannelDetails = {
	twitchUserId: string | undefined;
	twitchUserLogin: string | undefined;
	isTwitchLive: boolean | undefined;
	ytLiveVideoId: string | undefined;
	links: ChannelLink[] | undefined;
};

type SyncChannelInput = {
	ytChannelId: string;
	twitchUserId?: string;
	twitchUserLogin?: string;
	isTwitchLive?: boolean;
	ytLiveVideoId?: string;
	links?: ChannelLink[];
};

type SyncVideosArgs = {
	taskName?: string;
	backfill?: boolean;
	maxResults?: number;
};

const syncService = Effect.gen(function* () {
	const db = yield* DbService;
	const yt = yield* YoutubeService;
	const twitch = yield* TwitchService;

	const syncChannelBase = Effect.fn('syncChannelBase')(function* (
		ytChannelId: string,
		details?: SyncChannelDetails
	) {
		const channelDetails = yield* yt.getChannelDetails(ytChannelId);

		yield* db.upsertChannel({
			ytChannelId,
			ytName: channelDetails.ytName,
			ytHandle: channelDetails.ytHandle,
			ytDescription: channelDetails.ytDescription,
			ytAvatarUrl: channelDetails.ytAvatarUrl,
			ytBannerUrl: channelDetails.ytBannerUrl,
			ytBannerThumbHash: channelDetails.ytBannerThumbHash,
			ytViewCount: channelDetails.ytViewCount,
			ytSubscriberCount: channelDetails.ytSubscriberCount,
			ytVideoCount: channelDetails.ytVideoCount,
			ytJoinedAt: channelDetails.ytJoinedAt,
			twitchUserId: details?.twitchUserId ?? null,
			twitchUserLogin: details?.twitchUserLogin ?? null,
			isTwitchLive: details?.isTwitchLive ?? false,
			ytLiveVideoId: details?.ytLiveVideoId ?? null,
			links: details?.links ?? []
		});
	});

	const syncChannel = Effect.fn('syncChannel')(function* (
		ytChannelId: string,
		details?: SyncChannelDetails
	) {
		return yield* syncChannelBase(ytChannelId, details).pipe(
			Effect.catchTag(
				'DbError',
				(err) => new SyncError({ message: `DB ERROR: ${err.message}`, cause: err.cause })
			),
			Effect.catchTag(
				'YoutubeError',
				(err) => new SyncError({ message: `YOUTUBE ERROR: ${err.message}`, cause: err.cause })
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
			)
		);
	});

	const syncChannels = Effect.fn('syncChannels')(function* (
		channels: SyncChannelInput[],
		taskName?: string
	) {
		const start = performance.now();
		let successCount = 0;
		let errorCount = 0;
		const fullTaskName = taskName ? `${taskName}: ` : '';

		yield* Effect.logInfo(`${fullTaskName}Syncing channels`);
		yield* Effect.forEach(
			channels,
			(channel) =>
				syncChannel(channel.ytChannelId, {
					twitchUserId: channel.twitchUserId,
					twitchUserLogin: channel.twitchUserLogin,
					isTwitchLive: channel.isTwitchLive,
					ytLiveVideoId: channel.ytLiveVideoId,
					links: channel.links
				}).pipe(
					Effect.matchEffect({
						onSuccess: () => Effect.sync(() => successCount++),
						onFailure: (error) =>
							Effect.gen(function* () {
								errorCount++;
								yield* Effect.logError(`${fullTaskName}Failed to sync channel`, error);
							})
					})
				),
			{ concurrency: 5 }
		);

		yield* Effect.logInfo(
			`CHANNEL SYNC COMPLETED: ${successCount} channels synced, ${errorCount} channels failed`
		);
		yield* Effect.logInfo(`CHANNEL SYNC TOOK ${performance.now() - start}ms`);
	});

	const syncVideos = Effect.fn('syncVideos')(function* (
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
			(ytChannelId) =>
				Effect.gen(function* () {
					const videoIds = videosByChannel.get(ytChannelId) || [];
					const newVideoIds = videoIds.filter((id) => !existingVideoIds.has(id));
					if (newVideoIds.length === 0) return;

					const shortsMap = yield* yt
						.areVideosShorts(newVideoIds, ytChannelId, args.maxResults)
						.pipe(
							Effect.catchTag('YoutubeError', (error) =>
								Effect.gen(function* () {
									yield* Effect.logWarning(
										`\x1b[33m${fullTaskName}${error.message}, marking all as non-shorts\x1b[0m`
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
		yield* Effect.logInfo(`${fullTaskName}Syncing videos`);
		yield* Effect.forEach(
			allVideoDetailsMap.entries(),
			([ytVideoId, videoDetails]) =>
				db.upsertVideo({ ...videoDetails, isShort: allShortsMap.get(ytVideoId) ?? false }).pipe(
					Effect.matchEffect({
						onSuccess: (result) =>
							Effect.gen(function* () {
								if (result.wasSkipped) {
									skipCount++;
									yield* Effect.logWarning(
										`\x1b[33m${fullTaskName}Skipped video ${ytVideoId}\x1b[0m`
									);
									return;
								}

								successCount++;
							}),
						onFailure: (error) =>
							Effect.gen(function* () {
								errorCount++;
								yield* Effect.logError(`${fullTaskName}Failed to sync video ${ytVideoId}`, error);
							})
					})
				),
			{ concurrency: 5 }
		);

		yield* Effect.logInfo(
			`VIDEO SYNC COMPLETED: ${successCount} videos synced, ${errorCount} videos failed, ${skipCount} videos skipped`
		);

		// Clean up stale ytLiveVideoId references (e.g. ended/private livestreams)
		const clearedCount = yield* db.cleanupStaleLiveReferences();
		if (clearedCount > 0) {
			yield* Effect.logInfo(`Cleared ${clearedCount} stale YouTube live reference(s)`);
		}

		yield* Effect.logInfo(`VIDEO SYNC TOOK ${performance.now() - start}ms`);
	});

	const syncTwitchLive = Effect.fn('syncTwitchLive')(function* (taskName?: string) {
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
		yield* Effect.forEach(
			channels,
			(channel) =>
				db
					.updateChannel(channel.ytChannelId, {
						ytName: channel.ytName,
						ytHandle: channel.ytHandle,
						ytDescription: channel.ytDescription,
						ytAvatarUrl: channel.ytAvatarUrl,
						ytBannerUrl: channel.ytBannerUrl,
						ytBannerThumbHash: channel.ytBannerThumbHash,
						ytViewCount: channel.ytViewCount,
						ytSubscriberCount: channel.ytSubscriberCount,
						ytVideoCount: channel.ytVideoCount,
						twitchUserId: channel.twitchUserId,
						twitchUserLogin: channel.twitchUserLogin,
						isTwitchLive: channel.twitchUserId
							? (isTwitchLiveMap.get(channel.twitchUserId) ?? false)
							: false,
						ytLiveVideoId: channel.ytLiveVideoId,
						links: channel.links
					})
					.pipe(
						Effect.matchEffect({
							onSuccess: () => Effect.sync(() => successCount++),
							onFailure: (error) =>
								Effect.gen(function* () {
									errorCount++;
									yield* Effect.logError(
										`${fullTaskName}Failed to sync channel (twitch) ${channel.ytChannelId}`,
										error
									);
								})
						})
					),
			{ concurrency: 5 }
		);

		yield* Effect.logInfo(
			`TWITCH LIVE SYNC COMPLETED: ${successCount} channels synced, ${errorCount} channels failed`
		);
		yield* Effect.logInfo(`TWITCH LIVE SYNC TOOK ${performance.now() - start}ms`);
	});

	const syncYoutubeLive = Effect.fn('syncYoutubeLive')(function* (taskName?: string) {
		const start = performance.now();
		const fullTaskName = taskName ? `${taskName}: ` : '';
		const channels = yield* db.getAllChannels();

		yield* Effect.logInfo(`${fullTaskName}Syncing YouTube live status`);

		let successCount = 0;
		let errorCount = 0;
		let liveCount = 0;
		// Collect all video IDs from livestreams playlists
		const allVideoIds: string[] = [];
		const videoToChannelMap = new Map<string, string>();

		yield* Effect.forEach(
			channels,
			(channel) =>
				yt.getLiveStreamVideoIds(channel.ytChannelId, 5).pipe(
					Effect.matchEffect({
						onSuccess: (videoIds) =>
							Effect.sync(() => {
								for (const videoId of videoIds) {
									allVideoIds.push(videoId);
									videoToChannelMap.set(videoId, channel.ytChannelId);
								}
							}),
						onFailure: () =>
							Effect.logWarning(
								`\x1b[33m${fullTaskName}Failed to get livestream video IDs for ${channel.ytChannelId}\x1b[0m`
							)
					})
				),
			{ concurrency: 5 }
		);

		if (allVideoIds.length === 0) {
			yield* Effect.logInfo(`${fullTaskName}No livestream videos to check`);
			return;
		}

		// Get video details in batches of 50
		const liveVideosByChannel = new Map<string, string | null>();
		const liveVideoDetails = new Map<string, Omit<Video, 'isShort'>>();

		// Initialize all channels to null (no live video)
		for (const channel of channels) {
			liveVideosByChannel.set(channel.ytChannelId, null);
		}

		for (let i = 0; i < allVideoIds.length; i += 50) {
			const batch = allVideoIds.slice(i, i + 50);
			const batchDetails = yield* yt.getBatchVideoDetails(batch);

			for (const [videoId, details] of batchDetails.entries()) {
				const ytChannelId = videoToChannelMap.get(videoId);
				if (!ytChannelId) continue;

				if (details.livestreamType === 'live') {
					liveVideosByChannel.set(ytChannelId, videoId);
					liveVideoDetails.set(videoId, details);
					liveCount++;
				}
			}
		}

		// Upsert live videos to database first (to satisfy foreign key constraint)
		if (liveVideoDetails.size > 0) {
			yield* Effect.logInfo(`${fullTaskName}Upserting ${liveVideoDetails.size} live video(s)`);
			yield* Effect.forEach(
				liveVideoDetails.entries(),
				([videoId, details]) =>
					db.upsertVideo({ ...details, isShort: false }).pipe(
						Effect.matchEffect({
							onSuccess: () => Effect.void,
							onFailure: (error) =>
								Effect.gen(function* () {
									yield* Effect.logError(
										`${fullTaskName}Failed to upsert live video ${videoId}`,
										error
									);
									const ytChannelId = videoToChannelMap.get(videoId);
									if (ytChannelId) {
										liveVideosByChannel.set(ytChannelId, null);
									}
								})
						})
					),
				{ concurrency: 5 }
			);
		}

		// Update channels with live status
		yield* Effect.forEach(
			channels,
			(channel) =>
				db
					.updateChannel(channel.ytChannelId, {
						ytName: channel.ytName,
						ytHandle: channel.ytHandle,
						ytDescription: channel.ytDescription,
						ytAvatarUrl: channel.ytAvatarUrl,
						ytBannerUrl: channel.ytBannerUrl,
						ytBannerThumbHash: channel.ytBannerThumbHash,
						ytViewCount: channel.ytViewCount,
						ytSubscriberCount: channel.ytSubscriberCount,
						ytVideoCount: channel.ytVideoCount,
						twitchUserId: channel.twitchUserId,
						twitchUserLogin: channel.twitchUserLogin,
						isTwitchLive: channel.isTwitchLive,
						ytLiveVideoId: liveVideosByChannel.get(channel.ytChannelId) ?? null,
						links: channel.links
					})
					.pipe(
						Effect.matchEffect({
							onSuccess: () => Effect.sync(() => successCount++),
							onFailure: (error) =>
								Effect.gen(function* () {
									errorCount++;
									yield* Effect.logError(
										`${fullTaskName}Failed to update YT live status for ${channel.ytChannelId}`,
										error
									);
								})
						})
					),
			{ concurrency: 5 }
		);

		yield* Effect.logInfo(
			`YOUTUBE LIVE SYNC COMPLETED: ${successCount} channels synced, ${errorCount} failed, ${liveCount} currently live`
		);
		yield* Effect.logInfo(`YOUTUBE LIVE SYNC TOOK ${performance.now() - start}ms`);
	});

	return {
		syncChannel,
		syncVideo,
		syncChannels,
		syncVideos,
		syncTwitchLive,
		syncYoutubeLive
	};
});

type SyncShape = {
	syncChannel: (
		ytChannelId: string,
		details?: SyncChannelDetails
	) => Effect.Effect<void, SyncError>;
	syncVideo: (ytVideoId: string) => Effect.Effect<void, SyncError>;
	syncChannels: (channels: SyncChannelInput[], taskName?: string) => Effect.Effect<void>;
	syncVideos: (ytChannelIds: string[], args: SyncVideosArgs) => Effect.Effect<void, unknown>;
	syncTwitchLive: (taskName?: string) => Effect.Effect<void, unknown>;
	syncYoutubeLive: (taskName?: string) => Effect.Effect<void, unknown>;
};

export class SyncService extends Context.Service<SyncService, SyncShape>()(
	'@hc/content-sync/sync-service/SyncService'
) {}
