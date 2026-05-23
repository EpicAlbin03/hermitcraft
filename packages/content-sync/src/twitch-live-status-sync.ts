import * as Clock from 'effect/Clock';
import * as Context from 'effect/Context';
import * as Data from 'effect/Data';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { CreatorCatalog } from './creator-catalog';
import { TwitchService } from './twitch-service';

class TwitchLiveStatusSyncError extends Data.TaggedError('TwitchLiveStatusSyncError')<{
	message: string;
	cause?: unknown;
}> {}

const twitchLiveStatusSync = Effect.gen(function* () {
	const creatorCatalog = yield* CreatorCatalog;
	const twitch = yield* TwitchService;

	const refreshTwitchLiveStatus = Effect.fn('refreshTwitchLiveStatus')(function* (
		taskName?: string
	) {
		return yield* Effect.gen(function* () {
			const start = yield* Clock.currentTimeMillis;
			const creators = yield* creatorCatalog.listTrackedCreators();
			const twitchUserIds = creators
				.map((creator) => creator.twitchUserId)
				.filter((id) => id !== null && id !== undefined);
			const isTwitchLiveMap = yield* twitch.areChannelsLive(twitchUserIds);
			const fullTaskName = taskName ? `${taskName}: ` : '';

			yield* Effect.logInfo(`${fullTaskName}Syncing creators (twitch)`);
			const updates = creators.map((creator) => ({
				ytChannelId: creator.ytChannelId,
				isTwitchLive: creator.twitchUserId
					? (isTwitchLiveMap.get(creator.twitchUserId) ?? false)
					: false
			}));

			yield* creatorCatalog.setTrackedCreatorTwitchLiveStatuses(updates);

			const liveCount = updates.filter((update) => update.isTwitchLive).length;
			const end = yield* Clock.currentTimeMillis;
			yield* Effect.logInfo(
				`TWITCH LIVE SYNC COMPLETED: ${updates.length} creators synced, ${liveCount} currently live`
			);
			yield* Effect.logInfo(`TWITCH LIVE SYNC TOOK ${end - start}ms`);
		}).pipe(
			Effect.catchTags({
				CreatorCatalogError: (err) =>
					new TwitchLiveStatusSyncError({ message: err.message, cause: err.cause }),
				TwitchError: (err) =>
					new TwitchLiveStatusSyncError({
						message: `TWITCH ERROR: ${err.message}`,
						cause: err.cause
					})
			}),
			Effect.annotateLogs(taskName ? { taskName } : {}),
			Effect.withSpan('TwitchLiveStatusSync.refreshTwitchLiveStatus')
		);
	});

	return {
		refreshTwitchLiveStatus
	} as const;
});

type TwitchLiveStatusSyncShape = Effect.Success<typeof twitchLiveStatusSync>;

export class TwitchLiveStatusSync extends Context.Service<
	TwitchLiveStatusSync,
	TwitchLiveStatusSyncShape
>()('@hc/content-sync/twitch-live-status-sync/TwitchLiveStatusSync', {
	make: twitchLiveStatusSync
}) {
	static readonly layer = Layer.effect(this, this.make);
}
