import { Effect, Console } from 'effect';
import { DbService } from './db';
import { YoutubeService } from './youtube';
import { TaggedError } from 'effect/Data';
import type { ChannelLink } from '@hc/db';
import { TwitchService } from './twitch';

class SyncVideoError extends TaggedError('SyncVideoError') {
	constructor(message: string, options?: { cause?: unknown }) {
		super();
		this.message = message;
		this.cause = options?.cause;
	}
}

const channelSyncService = Effect.gen(function* () {
	const db = yield* DbService;
	const yt = yield* YoutubeService;
	const twitch = yield* TwitchService;

	const syncChannel = (
		ytChannelId: string,
		details: {
			twitchUserId?: string;
			twitchUserLogin?: string;
			isTwitchLive?: boolean;
			ytLiveVideoId?: string;
			links?: ChannelLink[];
		}
	) =>
		Effect.gen(function* () {
			const channelDetails = yield* yt.getChannelDetails(ytChannelId);
			const isTwitchLive =
				details.isTwitchLive ||
				(details.twitchUserId ? yield* twitch.isChannelLive(details.twitchUserId) : false);

			yield* db.upsertChannel({
				ytChannelId: ytChannelId,
				ytName: channelDetails.ytName,
				ytHandle: channelDetails.ytHandle,
				ytDescription: channelDetails.ytDescription,
				ytAvatarUrl: channelDetails.ytAvatarUrl,
				ytBannerUrl: channelDetails.ytBannerUrl,
				ytViewCount: channelDetails.ytViewCount,
				ytSubscriberCount: channelDetails.ytSubscriberCount,
				ytVideoCount: channelDetails.ytVideoCount,
				ytJoinedAt: channelDetails.ytJoinedAt,
				twitchUserId: details.twitchUserId || null,
				twitchUserLogin: details.twitchUserLogin || null,
				isTwitchLive: isTwitchLive,
				ytLiveVideoId: details.ytLiveVideoId || null,
				links: details.links || []
			});
		}).pipe(
			Effect.catchTag(
				'DbError',
				(err) => new SyncVideoError(`DB ERROR: ${err.message}`, { cause: err.cause })
			),
			Effect.catchTag(
				'YoutubeError',
				(err) => new SyncVideoError(`YOUTUBE ERROR: ${err.message}`, { cause: err.cause })
			)
		);

	const syncVideo = (ytVideoId: string) =>
		Effect.gen(function* () {
			const videoDetails = yield* yt.getVideoDetails(ytVideoId);
			const videoIsShort = yield* yt.isVideoShort(ytVideoId, videoDetails.ytChannelId);

			yield* db.upsertVideo({
				ytVideoId: ytVideoId,
				ytChannelId: videoDetails.ytChannelId,
				title: videoDetails.title,
				thumbnailUrl: videoDetails.thumbnailUrl,
				publishedAt: videoDetails.publishedAt,
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
		}).pipe(
			Effect.catchTag(
				'DbError',
				(err) => new SyncVideoError(`DB ERROR: ${err.message}`, { cause: err.cause })
			),
			Effect.catchTag(
				'YoutubeError',
				(err) => new SyncVideoError(`YOUTUBE ERROR: ${err.message}`, { cause: err.cause })
			)
		);

	const syncChannels = (
		channels: {
			ytChannelId: string;
			twitchUserId?: string;
			twitchUserLogin?: string;
			isTwitchLive?: boolean;
			ytLiveVideoId?: string;
			links?: ChannelLink[];
		}[],
		taskName?: string
	) =>
		Effect.gen(function* () {
			const start = performance.now();

			const isTwitchLiveMap = yield* twitch.areChannelsLive(
				channels.map((c) => c.twitchUserId).filter((id) => id !== null && id !== undefined)
			);

			let successCount = 0;
			let errorCount = 0;
			const fullTaskName = taskName ? `${taskName}: ` : '';

			yield* Effect.forEach(
				channels,
				(channel) =>
					Effect.gen(function* () {
						yield* Console.log(`${fullTaskName}Syncing channel ${channel.ytChannelId}`);
						const result = yield* syncChannel(channel.ytChannelId, {
							twitchUserId: channel.twitchUserId || undefined,
							twitchUserLogin: channel.twitchUserLogin || undefined,
							isTwitchLive: channel.twitchUserId
								? isTwitchLiveMap.get(channel.twitchUserId) || false
								: undefined,
							ytLiveVideoId: channel.ytLiveVideoId || undefined,
							links: channel.links || []
						}).pipe(Effect.either);

						if (result._tag === 'Right') {
							successCount++;
							yield* Console.log(`${fullTaskName}Synced channel ${channel.ytChannelId}`);
						} else {
							errorCount++;
							yield* Console.error(`${fullTaskName}Failed to sync channel`, result.left);
						}
					}),
				{ concurrency: 5 }
			);

			yield* Console.log(
				`CHANNEL SYNC COMPLETED: ${successCount} channels synced, ${errorCount} channels failed`
			);
			yield* Console.log(`CHANNEL SYNC TOOK ${performance.now() - start}ms`);
		});

	const syncVideos = (
		ytChannelIds: string[],
		args: {
			taskName?: string;
			backfill?: boolean;
			maxResults?: number;
		} = {
			taskName: undefined,
			backfill: false,
			maxResults: 50
		}
	) =>
		Effect.gen(function* () {
			const start = performance.now();

			let successCount = 0;
			let errorCount = 0;
			let skipCount = 0;
			const fullTaskName = args.taskName ? `${args.taskName}: ` : '';

			yield* Effect.forEach(
				ytChannelIds,
				(ytChannelId) =>
					Effect.gen(function* () {
						const videoIds = args.backfill
							? yield* yt.getVideoIdsFromUploadsPlaylist(ytChannelId, args.maxResults)
							: (yield* yt.getRSSVideoIds(ytChannelId)).slice(0, args.maxResults);
						const batchVideoDetailsMap = yield* yt.getBatchVideoDetails(videoIds);

						const areVideosShorts = yield* yt
							.areVideosShorts(videoIds, ytChannelId, args.maxResults)
							.pipe(
								Effect.catchTag('YoutubeError', (err) =>
									Effect.gen(function* () {
										yield* Console.warn(
											`\x1b[33m${fullTaskName}${err.message}, marking all as non-shorts\x1b[0m`
										);
										return new Map<string, boolean>();
									})
								)
							);

						yield* Effect.forEach(
							batchVideoDetailsMap.entries(),
							([ytVideoId, videoDetails]) =>
								Effect.gen(function* () {
									const videoIsShort = areVideosShorts.get(ytVideoId) || false;
									yield* Console.log(`${fullTaskName}Syncing video ${ytVideoId}`);
									const result = yield* db
										.upsertVideo({ ...videoDetails, isShort: videoIsShort })
										.pipe(Effect.either);

									if (result._tag === 'Right') {
										if (result.right?.wasSkipped) {
											skipCount++;
											yield* Console.warn(
												`\x1b[33m${fullTaskName}Skipped video ${ytVideoId}\x1b[0m`
											);
										} else {
											successCount++;
											yield* Console.log(`${fullTaskName}Synced video ${ytVideoId}`);
										}
									} else {
										errorCount++;
										yield* Console.error(
											`${fullTaskName}Failed to sync video ${ytVideoId}`,
											result.left
										);
									}
								}),
							{ concurrency: 5 }
						);
					})
				// { concurrency: 5 }
			);

			yield* Console.log(
				`VIDEO SYNC COMPLETED: ${successCount} videos synced, ${errorCount} videos failed, ${skipCount} videos skipped`
			);
			yield* Console.log(`VIDEO SYNC TOOK ${performance.now() - start}ms`);
		});

	return {
		syncChannel,
		syncVideo,
		syncChannels,
		syncVideos
	};
});

export class ChannelSyncService extends Effect.Service<ChannelSyncService>()('ChannelSyncService', {
	dependencies: [DbService.Default, YoutubeService.Default, TwitchService.Default],
	effect: channelSyncService
}) {}

export * from './db';
export * from './youtube';
export * from './twitch';
