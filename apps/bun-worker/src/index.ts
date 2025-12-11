import { BunRuntime } from '@effect/platform-bun';
import { ChannelSyncService, DbService } from '@hc/channel-sync';
import { DB_SCHEMA } from '@hc/db';
import { Effect, Layer, Schedule } from 'effect';

const appLayer = Layer.provideMerge(ChannelSyncService.Default, DbService.Default);

const main = Effect.gen(function* () {
	const channelSync = yield* ChannelSyncService;
	const db = yield* DbService;

	// Global state for twitch live status
	const state = { isTwitchLiveMap: new Map<string, boolean>() };

	// 25 channels
	// 1 quota per channel
	// Each run = 25 * 1 = 25 quotas
	const channelSyncProgram = Effect.gen(function* () {
		yield* Effect.log('BUN_WORKER: starting channel sync');
		const channels = yield* db.getAllChannels({
			ytChannelId: DB_SCHEMA.channels.ytChannelId,
			twitchUserId: DB_SCHEMA.channels.twitchUserId,
			ytLiveVideoId: DB_SCHEMA.channels.ytLiveVideoId
		});
		const isTwitchLiveChannels = channels.map((channel) => {
			return {
				ytChannelId: channel.ytChannelId,
				twitchUserId: channel.twitchUserId || undefined,
				isTwitchLive: channel.twitchUserId
					? state.isTwitchLiveMap.get(channel.twitchUserId) || false
					: false,
				ytLiveVideoId: channel.ytLiveVideoId || undefined
			};
		});
		yield* channelSync.syncChannels(isTwitchLiveChannels, 'BUN_WORKER');
		yield* Effect.log('BUN_WORKER: finished channel sync');
	}).pipe(
		Effect.catchAllCause((cause) => Effect.logError('BUN_WORKER: channel sync failed', cause)),
		Effect.repeat(Schedule.spaced('24 hours'))
	);

	// Token-bucket based per minute
	const twitchSyncProgram = Effect.gen(function* () {
		yield* Effect.log('BUN_WORKER: starting twitch sync');
		state.isTwitchLiveMap = yield* channelSync.syncTwitchLive('BUN_WORKER');
		yield* Effect.log('BUN_WORKER: finished twitch sync');
	}).pipe(
		Effect.catchAllCause((cause) => Effect.logError('BUN_WORKER: twitch sync failed', cause)),
		Effect.repeat(Schedule.spaced('1 hour'))
	);

	// 25 channels * 15 videos = 375 videos
	// 1 quota per 50 videos (375 / 50 = 7.5) + (1 quota per channel for new videos checking isVideoShort)
	// Each run = 8 quotas (9 if new video)
	const videoSyncProgram = Effect.gen(function* () {
		yield* Effect.log('BUN_WORKER: starting video sync');
		const channels = yield* db.getAllChannels({ ytChannelId: DB_SCHEMA.channels.ytChannelId });
		const channelIds = channels.map((channel) => channel.ytChannelId);
		yield* channelSync.syncVideos(channelIds, { taskName: 'BUN_WORKER', maxResults: 50 });
		yield* Effect.log('BUN_WORKER: finished video sync');
	}).pipe(
		Effect.catchAllCause((cause) => Effect.logError('BUN_WORKER: video sync failed', cause)),
		Effect.repeat(Schedule.spaced('1 hour'))
	);

	yield* Effect.all([channelSyncProgram, twitchSyncProgram, videoSyncProgram], { concurrency: 3 });
}).pipe(Effect.provide(appLayer), Effect.withSpan('BgWorker.main'));

BunRuntime.runMain(main);
