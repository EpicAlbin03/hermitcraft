import { BunRuntime } from '@effect/platform-bun';
import { CreatorSync } from '@hc/content-sync/creator-sync';
import { DbService } from '@hc/content-sync/db-service';
import { SyncService } from '@hc/content-sync/sync-service';
import { TwitchService } from '@hc/content-sync/twitch-service';
import { VideoSync } from '@hc/content-sync/video-sync';
import { YoutubeLiveStatusSync } from '@hc/content-sync/youtube-live-status-sync';
import { YoutubeService } from '@hc/content-sync/yt-service';
import { PgClientLive } from '@hc/db/connection';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { SyncJobs } from './sync-jobs';

const sharedLayer = Layer.mergeAll(
	DbService.layer.pipe(Layer.provide(PgClientLive)),
	TwitchService.layer,
	YoutubeService.layer
);

const creatorSyncLayer = CreatorSync.layer.pipe(Layer.provide(sharedLayer));
const youtubeLiveStatusSyncLayer = YoutubeLiveStatusSync.layer.pipe(Layer.provide(sharedLayer));
const videoSyncDependencies = Layer.merge(sharedLayer, youtubeLiveStatusSyncLayer);
const videoSyncLayer = VideoSync.layer.pipe(Layer.provide(videoSyncDependencies));
const syncLayerDependencies = Layer.mergeAll(
	sharedLayer,
	creatorSyncLayer,
	youtubeLiveStatusSyncLayer,
	videoSyncLayer
);
const syncServiceLayer = SyncService.layer.pipe(Layer.provide(syncLayerDependencies));
const syncJobsDependencies = Layer.merge(syncLayerDependencies, syncServiceLayer);
const syncJobsLayer = SyncJobs.layer.pipe(Layer.provide(syncJobsDependencies));
const appLayer = Layer.mergeAll(syncJobsDependencies, syncJobsLayer);

const main = Effect.gen(function* () {
	const syncJobs = yield* SyncJobs;
	yield* syncJobs.runAll();
}).pipe(Effect.provide(appLayer), Effect.withSpan('BgWorker.main'));

BunRuntime.runMain(main);
