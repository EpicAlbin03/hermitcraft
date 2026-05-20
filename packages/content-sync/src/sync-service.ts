import * as Context from 'effect/Context';
import * as Data from 'effect/Data';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { CreatorSync, type CreatorSyncInput } from './creator-sync';
import { DbService } from './db-service';
import { TwitchService } from './twitch-service';
import { VideoSync, type VideoSyncArgs } from './video-sync';
import { YoutubeLiveStatusSync } from './youtube-live-status-sync';
import { YoutubeService } from './yt-service';

class SyncError extends Data.TaggedError('SyncError')<{ message: string; cause?: unknown }> {}

type SyncChannelInput = CreatorSyncInput;

type SyncVideosArgs = VideoSyncArgs;

const syncService = Effect.gen(function* () {
	const db = yield* DbService;
	const yt = yield* YoutubeService;
	const twitch = yield* TwitchService;
	const creatorSync = yield* CreatorSync;
	const videoSync = yield* VideoSync;
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
		yield* videoSync.syncVideosForChannels(ytChannelIds, args);
	});

	const syncVideos = Effect.fn('syncVideos')(function* (
		ytChannelIds: string[],
		args: SyncVideosArgs
	) {
		return yield* syncVideosBase(ytChannelIds, args).pipe(
			Effect.catchTag(
				'VideoSyncError',
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
