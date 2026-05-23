import { PgClientLive } from '@hc/db/connection';
import * as Layer from 'effect/Layer';
import { CreatorCatalog } from './creator-catalog';
import { CreatorSync } from './creator-sync';
import { DbService } from './db-service';
import { RecurringContentSync } from './recurring-content-sync';
import { TwitchLiveStatusSync } from './twitch-live-status-sync';
import { TwitchService } from './twitch-service';
import { VideoSync } from './video-sync';
import { YtService } from './yt-service';

export const sharedLayer = Layer.mergeAll(
	DbService.layer.pipe(Layer.provide(PgClientLive)),
	TwitchService.layer,
	YtService.layer
);

export const creatorCatalogLayer = CreatorCatalog.layer.pipe(Layer.provide(sharedLayer));

export const creatorSyncLayer = CreatorSync.layer.pipe(
	Layer.provide(Layer.merge(sharedLayer, creatorCatalogLayer))
);

export const twitchLiveStatusSyncLayer = TwitchLiveStatusSync.layer.pipe(
	Layer.provide(Layer.merge(sharedLayer, creatorCatalogLayer))
);

export const videoSyncLayer = VideoSync.layer.pipe(
	Layer.provide(Layer.merge(sharedLayer, creatorCatalogLayer))
);

export const recurringContentSyncLayer = RecurringContentSync.layer.pipe(
	Layer.provide(
		Layer.mergeAll(
			sharedLayer,
			creatorCatalogLayer,
			creatorSyncLayer,
			twitchLiveStatusSyncLayer,
			videoSyncLayer
		)
	)
);

export const contentSyncLayer = Layer.mergeAll(
	sharedLayer,
	creatorCatalogLayer,
	creatorSyncLayer,
	twitchLiveStatusSyncLayer,
	videoSyncLayer,
	recurringContentSyncLayer
);
