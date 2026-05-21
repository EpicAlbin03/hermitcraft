import { BunRuntime } from '@effect/platform-bun';
import { contentSyncLayer } from '@hc/content-sync/layer';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { SyncJobs } from './sync-jobs';

const syncJobsLayer = SyncJobs.layer.pipe(Layer.provide(contentSyncLayer));
const appLayer = Layer.merge(contentSyncLayer, syncJobsLayer);

const main = Effect.gen(function* () {
	const syncJobs = yield* SyncJobs;
	yield* syncJobs.runAll();
}).pipe(
	Effect.annotateLogs({ app: 'bg-worker' }),
	Effect.provide(appLayer),
	Effect.withSpan('BgWorker.main')
);

BunRuntime.runMain(main);
