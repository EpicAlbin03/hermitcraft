import { BunRuntime } from '@effect/platform-bun';
import { ChannelSyncService, DbService } from '@hc/channel-sync';
import { Effect, Layer, Schedule } from 'effect';

const appLayer = Layer.provideMerge(ChannelSyncService.Default, DbService.Default);

const runChannelSync = Effect.fn('BgWorker.runChannelSync')(function* () {
	const channelSync = yield* ChannelSyncService;
	yield* Effect.log('starting sync');
	yield* channelSync.syncChannels();
	yield* Effect.log('finished sync');
});

const runVideoSync = Effect.fn('BgWorker.runVideoSync')(function* () {
	const channelSync = yield* ChannelSyncService;
	yield* Effect.log('starting sync');
	yield* channelSync.syncVideos();
	yield* Effect.log('finished sync');
});

const channelSyncProgram = runChannelSync().pipe(
	Effect.catchAllCause((cause) => Effect.logError('channel sync failed', cause)),
	Effect.repeat(Schedule.spaced('24 hours'))
);

const videoSyncProgram = runVideoSync().pipe(
	Effect.catchAllCause((cause) => Effect.logError('video sync failed', cause)),
	Effect.repeat(Schedule.spaced('1 hour'))
);

const program = Effect.all([channelSyncProgram, videoSyncProgram], {
	concurrency: 2
}).pipe(Effect.provide(appLayer), Effect.withSpan('BgWorker.main'));

BunRuntime.runMain(program);
