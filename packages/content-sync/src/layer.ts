import { PgClientLive } from '@hc/db/connection';
import * as Layer from 'effect/Layer';
import { CreatorSync } from './creator-sync';
import { DbService } from './db-service';
import { SyncService } from './sync-service';
import { TwitchService } from './twitch-service';
import { VideoSync } from './video-sync';
import { YtLiveStatusSync } from './yt-live-status-sync';
import { YtService } from './yt-service';

export const sharedLayer = Layer.mergeAll(
	DbService.layer.pipe(Layer.provide(PgClientLive)),
	TwitchService.layer,
	YtService.layer
);

export const creatorSyncLayer = CreatorSync.layer.pipe(Layer.provide(sharedLayer));

export const ytLiveStatusSyncLayer = YtLiveStatusSync.layer.pipe(Layer.provide(sharedLayer));

export const videoSyncLayer = VideoSync.layer.pipe(
	Layer.provide(Layer.merge(sharedLayer, ytLiveStatusSyncLayer))
);

export const contentSyncLayer = Layer.mergeAll(
	sharedLayer,
	creatorSyncLayer,
	ytLiveStatusSyncLayer,
	videoSyncLayer,
	SyncService.layer.pipe(
		Layer.provide(
			Layer.mergeAll(sharedLayer, creatorSyncLayer, ytLiveStatusSyncLayer, videoSyncLayer)
		)
	)
);
