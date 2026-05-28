import * as Context from 'effect/Context';
import * as Data from 'effect/Data';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { CreatorCatalog } from './creator-catalog';
import { CreatorSync } from './creator-sync';
import { TwitchLiveStatusSync } from './twitch-live-status-sync';
import { VideoSync, type VideoSyncArgs } from './video-sync';

class RecurringContentSyncError extends Data.TaggedError('RecurringContentSyncError')<{
	message: string;
	cause?: unknown;
}> {}

const recurringContentSync = Effect.gen(function* () {
	const creatorCatalog = yield* CreatorCatalog;
	const creatorSync = yield* CreatorSync;
	const twitchLiveStatusSync = yield* TwitchLiveStatusSync;
	const videoSync = yield* VideoSync;

	const runCreatorSync = Effect.fn('runCreatorSync')(function* (taskName?: string) {
		return yield* Effect.gen(function* () {
			const creators = yield* creatorCatalog.listTrackedCreators();
			yield* creatorSync.syncCreators(creators, taskName);
		}).pipe(
			Effect.catchTag(
				'CreatorCatalogError',
				(err) => new RecurringContentSyncError({ message: err.message, cause: err.cause })
			),
			Effect.annotateLogs(taskName ? { taskName } : {}),
			Effect.withSpan('RecurringContentSync.runCreatorSync')
		);
	});

	const runVideoSync = Effect.fn('runVideoSync')(function* (args: VideoSyncArgs) {
		return yield* Effect.gen(function* () {
			const ytChannelIds = yield* creatorCatalog.listTrackedCreatorIds();
			yield* videoSync.syncVideosForCreators(ytChannelIds, args);
		}).pipe(
			Effect.catchTags({
				CreatorCatalogError: (err) =>
					new RecurringContentSyncError({ message: err.message, cause: err.cause }),
				VideoSyncError: (err) =>
					new RecurringContentSyncError({ message: err.message, cause: err.cause })
			}),
			Effect.annotateLogs(args.taskName ? { taskName: args.taskName } : {}),
			Effect.withSpan('RecurringContentSync.runVideoSync')
		);
	});

	const runVideoBackfill = Effect.fn('runVideoBackfill')(function* (taskName?: string) {
		return yield* runVideoSync({
			backfill: true,
			...(taskName ? { taskName } : {})
		});
	});

	const runTwitchLiveStatusSync = Effect.fn('runTwitchLiveStatusSync')(function* (
		taskName?: string
	) {
		return yield* twitchLiveStatusSync.refreshTwitchLiveStatus(taskName).pipe(
			Effect.catchTag(
				'TwitchLiveStatusSyncError',
				(err) => new RecurringContentSyncError({ message: err.message, cause: err.cause })
			),
			Effect.annotateLogs(taskName ? { taskName } : {}),
			Effect.withSpan('RecurringContentSync.runTwitchLiveStatusSync')
		);
	});

	const runYtLiveStatusSync = Effect.fn('runYtLiveStatusSync')(function* (taskName?: string) {
		return yield* Effect.gen(function* () {
			const ytChannelIds = yield* creatorCatalog.listTrackedCreatorIds();
			yield* videoSync.refreshYtLiveStatus(ytChannelIds, taskName);
		}).pipe(
			Effect.catchTags({
				CreatorCatalogError: (err) =>
					new RecurringContentSyncError({ message: err.message, cause: err.cause }),
				VideoSyncError: (err) =>
					new RecurringContentSyncError({ message: err.message, cause: err.cause })
			}),
			Effect.annotateLogs(taskName ? { taskName } : {}),
			Effect.withSpan('RecurringContentSync.runYtLiveStatusSync')
		);
	});

	return {
		runCreatorSync,
		runVideoSync,
		runVideoBackfill,
		runTwitchLiveStatusSync,
		runYtLiveStatusSync
	} as const;
});

type RecurringContentSyncShape = Effect.Success<typeof recurringContentSync>;

export class RecurringContentSync extends Context.Service<
	RecurringContentSync,
	RecurringContentSyncShape
>()('@hc/content-sync/recurring-content-sync/RecurringContentSync', {
	make: recurringContentSync
}) {
	static readonly layer = Layer.effect(this, this.make);
}
