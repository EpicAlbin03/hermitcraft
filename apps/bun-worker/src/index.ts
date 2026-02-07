import { BunRuntime } from '@effect/platform-bun';
import { ChannelSyncService, DbService } from '@hc/channel-sync';
import { DB_SCHEMA } from '@hc/db';
import { Cron, Effect, Layer, Schedule } from 'effect';

// 06:00 UTC
// 01:00 ET (US Eastern)
// 22:00 PT (previous day) (US Pacific)
// 06:00 GMT (UK)
// 07:00 CET (Central Europe)
const dailyCron = Schedule.cron(Cron.unsafeParse('0 0 6 * * *', 'UTC'));

const appLayer = Layer.provideMerge(ChannelSyncService.Default, DbService.Default);

const main = Effect.gen(function* () {
	const channelSync = yield* ChannelSyncService;
	const db = yield* DbService;

	// 25 channels
	// 1 quota per channel
	// Each run = 25 * 1 = 25 quotas
	const channelSyncProgram = Effect.gen(function* () {
		yield* Effect.log('BUN_WORKER: starting channel sync');
		const channels = yield* db.getAllChannels({
			ytChannelId: DB_SCHEMA.channels.ytChannelId
		});
		yield* channelSync.syncChannels(channels, 'BUN_WORKER');
		yield* Effect.log('BUN_WORKER: finished channel sync');
	}).pipe(
		Effect.catchAllCause((cause) => Effect.logError('BUN_WORKER: channel sync failed', cause)),
		Effect.schedule(dailyCron)
	);

	// Token-bucket based per minute
	const twitchSyncProgram = Effect.gen(function* () {
		yield* Effect.log('BUN_WORKER: starting twitch sync');
		yield* channelSync.syncTwitchLive('BUN_WORKER');
		yield* Effect.log('BUN_WORKER: finished twitch sync');
	}).pipe(
		Effect.catchAllCause((cause) => Effect.logError('BUN_WORKER: twitch sync failed', cause)),
		Effect.schedule(Schedule.spaced('2 minutes'))
	);

	// * Disabled due to youtube quota limits
	// const youtubeLiveSyncProgram = Effect.gen(function* () {
	// 	yield* Effect.log('BUN_WORKER: starting youtube live sync');
	// 	yield* channelSync.syncYoutubeLive('BUN_WORKER');
	// 	yield* Effect.log('BUN_WORKER: finished youtube live sync');
	// }).pipe(
	// 	Effect.catchAllCause((cause) =>
	// 		Effect.logError('BUN_WORKER: youtube live sync failed', cause)
	// 	),
	// 	Effect.schedule(Schedule.spaced('2 minutes'))
	// );

	// 25 channels * 15 videos = 375 videos
	// 1 quota per 50 videos (375 / 50 = 7.5 = 8 batches) + (1 quota per channel for new videos checking isVideoShort)
	// Each run = 8 * 1 + upto 25 * playlist batches
	// Assuming <= 50 videos per channel (rss = 15 videos):
	// Best case: 8 quotas (no new videos)
	// Worst case: 33 quotas (every channel has new videos)
	// Every 2 minutes = 5,760 quotas
	const videoSyncProgram = Effect.gen(function* () {
		yield* Effect.log('BUN_WORKER: starting video sync');
		const channels = yield* db.getAllChannels({ ytChannelId: DB_SCHEMA.channels.ytChannelId });
		const channelIds = channels.map((channel) => channel.ytChannelId);
		yield* channelSync.syncVideos(channelIds, { taskName: 'BUN_WORKER', maxResults: 50 });
		yield* Effect.log('BUN_WORKER: finished video sync');
	}).pipe(
		Effect.catchAllCause((cause) => Effect.logError('BUN_WORKER: video sync failed', cause)),
		Effect.schedule(Schedule.spaced('2 minutes'))
	);

	// Example backfill 100 videos per channel (using uploads playlist):
	// 25 * 100 = 2500 videos
	// 100 / 50 = 2 playlist batches per channel
	// Uploads playlist = 25 * 2 = 50 quotas
	// Video details = 2500 / 50 = 50 quotas
	// Shorts playlist = 25 * 2 = 50 quotas (if videos aren't new, this can be excluded)
	// Total = 150 quotas
	// Backfill all 61,662 videos = 3,702 quotas or 2,468 quotas if videos already exist
	const backfillSyncProgram = Effect.gen(function* () {
		yield* Effect.log('BUN_WORKER: starting backfill sync');
		const channels = yield* db.getAllChannels({ ytChannelId: DB_SCHEMA.channels.ytChannelId });
		const channelIds = channels.map((channel) => channel.ytChannelId);
		yield* channelSync.syncVideos(channelIds, {
			taskName: 'BUN_WORKER',
			backfill: true
			// all videos
		});
		yield* Effect.log('BUN_WORKER: finished backfill sync');
	}).pipe(
		Effect.catchAllCause((cause) => Effect.logError('BUN_WORKER: backfill sync failed', cause)),
		Effect.schedule(dailyCron)
	);

	yield* Effect.all(
		[channelSyncProgram, twitchSyncProgram, videoSyncProgram, backfillSyncProgram],
		{ concurrency: 5 }
	);
}).pipe(Effect.provide(appLayer), Effect.withSpan('BgWorker.main'));

BunRuntime.runMain(main);
