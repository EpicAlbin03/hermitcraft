import { Effect, Console } from 'effect';
import { DbService } from './db';
import { YoutubeService } from './youtube';
import { TaggedError } from 'effect/Data';
import type { Video } from '@hc/db';

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

	const syncChannel = (args: { ytChannelId: string }) =>
		Effect.gen(function* () {
			const channelDetails = yield* yt.getChannelDetails(args);

			yield* db.upsertChannel({
				ytChannelId: args.ytChannelId,
				name: channelDetails.name,
				description: channelDetails.description,
				thumbnailUrl: channelDetails.thumbnailUrl,
				bannerUrl: channelDetails.bannerUrl,
				handle: channelDetails.handle,
				viewCount: channelDetails.viewCount,
				subscriberCount: channelDetails.subscriberCount,
				videoCount: channelDetails.videoCount,
				joinedAt: channelDetails.joinedAt
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

	const syncVideo = (args: { ytVideoId: string }) =>
		Effect.gen(function* () {
			const videoDetails = yield* yt.getVideoDetails(args);

			yield* db.upsertVideo({
				ytVideoId: args.ytVideoId,
				ytChannelId: videoDetails.ytChannelId,
				title: videoDetails.title,
				thumbnailUrl: videoDetails.thumbnailUrl,
				publishedAt: videoDetails.publishedAt,
				viewCount: videoDetails.viewCount,
				likeCount: videoDetails.likeCount,
				commentCount: videoDetails.commentCount,
				duration: videoDetails.duration,
				isLiveStream: videoDetails.isLiveStream,
				isShort: videoDetails.isShort
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

	const syncRSSVideo = (video: Video) =>
		Effect.gen(function* () {
			yield* db.upsertVideo(video);
		}).pipe(
			Effect.catchTag(
				'DbError',
				(err) => new SyncVideoError(`DB ERROR: ${err.message}`, { cause: err.cause })
			)
		);

	const syncChannels = () =>
		Effect.gen(function* () {
			const start = performance.now();
			const channels = yield* db.getAllChannels();

			let successCount = 0;
			let errorCount = 0;

			yield* Effect.forEach(channels, (channel) =>
				Effect.gen(function* () {
					console.log(`Syncing channel ${channel.ytChannelId} - ${channel.name}`);
					const result = yield* syncChannel({ ytChannelId: channel.ytChannelId }).pipe(
						Effect.either
					);

					if (result._tag === 'Right') {
						successCount++;
						console.log(`Synced channel ${channel.ytChannelId} - ${channel.name}`);
					} else {
						errorCount++;
						console.error('LIVE CRAWLER: Failed to sync channel', result.left);
					}
				})
			);

			yield* Console.log(
				`CHANNEL SYNC COMPLETED: ${successCount} channels synced, ${errorCount} channels failed`
			);
			yield* Console.log(`LIVE CRAWLER TOOK ${performance.now() - start}ms`);
		});

	const syncVideos = () =>
		Effect.gen(function* () {
			const start = performance.now();
			const channels = yield* db.getAllChannels();

			let successCount = 0;
			let errorCount = 0;
			const BATCH_SIZE = 50;

			yield* Effect.forEach(channels, (channel) =>
				Effect.gen(function* () {
					const rssVideosResult = yield* yt
						.getRSSVideos({ ytChannelId: channel.ytChannelId })
						.pipe(Effect.either);
					if (rssVideosResult._tag === 'Left') {
						console.error('LIVE CRAWLER: Failed to get recent videos', rssVideosResult.left);
						return;
					}

					const rssVideos = rssVideosResult.right;
					const videoIds = rssVideos.map((v) => v.ytVideoId);
					const batches: string[][] = [];
					for (let i = 0; i < videoIds.length; i += BATCH_SIZE) {
						batches.push(videoIds.slice(i, i + BATCH_SIZE));
					}

					const batchResults = yield* Effect.forEach(batches, (batch) =>
						yt.getBatchRSSVideoDetails({ ytVideoIds: batch }).pipe(Effect.either)
					);

					const detailsMap: Record<
						string,
						Pick<Video, 'commentCount' | 'duration' | 'isLiveStream' | 'isShort'>
					> = {};
					for (const result of batchResults) {
						if (result._tag === 'Right') {
							Object.assign(detailsMap, result.right);
						} else {
							console.error('LIVE CRAWLER: Failed to fetch video details', result.left);
						}
					}

					yield* Effect.forEach(rssVideos, (rssVideo) =>
						Effect.gen(function* () {
							const details = detailsMap[rssVideo.ytVideoId];
							const result = yield* syncRSSVideo({ ...rssVideo, ...details } as Video).pipe(
								Effect.either
							);

							if (result._tag === 'Right') {
								successCount++;
								console.log(`Synced video ${rssVideo.ytVideoId} - ${rssVideo.title}`);
							} else {
								errorCount++;
								console.error('LIVE CRAWLER: Failed to sync video', result.left);
							}
						})
					);
				})
			);

			yield* Console.log(
				`VIDEO SYNC COMPLETED: ${successCount} videos synced, ${errorCount} videos failed`
			);
			yield* Console.log(`VIDEO SYNC TOOK ${performance.now() - start}ms`);
		});

	const backfillChannel = (args: { ytChannelId: string }) =>
		Effect.gen(function* () {
			const start = performance.now();
			yield* Console.log(`BACKFILL: Starting backfill for channel ${args.ytChannelId}`);

			const channel = yield* db.getChannel(args.ytChannelId);
			if (!channel) {
				return yield* Effect.fail(new SyncVideoError('Channel not found'));
			}

			const videoIds = yield* yt.getVideosFromUploadsPlaylist({
				ytChannelId: args.ytChannelId
			});

			yield* Console.log(`BACKFILL: Found ${videoIds.length} videos to backfill`);

			let successCount = 0;
			let errorCount = 0;

			yield* Effect.forEach(
				videoIds,
				(videoId) =>
					Effect.gen(function* () {
						console.log(`BACKFILL: Syncing video ${videoId}`);
						const result = yield* syncVideo({ ytVideoId: videoId }).pipe(Effect.either);

						if (result._tag === 'Right') {
							successCount++;
							console.log(`BACKFILL: Successfully synced video ${videoId}`);
						} else {
							errorCount++;
							console.error(`BACKFILL: Failed to sync video ${videoId}`, result.left);
						}
					}),
				{ concurrency: 5 }
			);

			yield* Console.log(
				`BACKFILL COMPLETED: ${successCount} videos synced, ${errorCount} videos failed`
			);
			yield* Console.log(`BACKFILL TOOK ${performance.now() - start}ms`);
		});

	return {
		syncChannel,
		syncVideo,
		syncRSSVideo,
		syncChannels,
		syncVideos,
		backfillChannel
	};
});

export class ChannelSyncService extends Effect.Service<ChannelSyncService>()('ChannelSyncService', {
	dependencies: [YoutubeService.Default],
	effect: channelSyncService
}) {}

export * from './db';
