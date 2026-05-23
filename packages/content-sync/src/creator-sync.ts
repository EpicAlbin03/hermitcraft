import * as Clock from 'effect/Clock';
import * as Context from 'effect/Context';
import * as Data from 'effect/Data';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Ref from 'effect/Ref';
import { CreatorCatalog, type CreatorCatalogSyncInput } from './creator-catalog';
import { YtService } from './yt-service';

class CreatorSyncError extends Data.TaggedError('CreatorSyncError')<{
	message: string;
	cause?: unknown;
}> {}

export type CreatorSyncInput = CreatorCatalogSyncInput;

const creatorSync = Effect.gen(function* () {
	const creatorCatalog = yield* CreatorCatalog;
	const yt = yield* YtService;

	const syncCreator = Effect.fn('syncCreator')(function* (input: CreatorSyncInput) {
		return yield* Effect.gen(function* () {
			const creatorSnapshot = yield* yt.getChannelDetails(input.ytChannelId);

			yield* creatorCatalog.upsertTrackedCreatorFromSnapshot(input, creatorSnapshot);
		}).pipe(
			Effect.catchTags({
				CreatorCatalogError: (err) =>
					new CreatorSyncError({ message: err.message, cause: err.cause }),
				YtError: (err) =>
					new CreatorSyncError({ message: `YT ERROR: ${err.message}`, cause: err.cause })
			}),
			Effect.annotateLogs({ ytChannelId: input.ytChannelId }),
			Effect.withSpan('CreatorSync.syncCreator')
		);
	});

	const syncCreators = Effect.fn('syncCreators')(function* (
		inputs: CreatorSyncInput[],
		taskName?: string
	) {
		return yield* Effect.gen(function* () {
			const start = yield* Clock.currentTimeMillis;
			const counts = yield* Ref.make({ successCount: 0, errorCount: 0 });
			const fullTaskName = taskName ? `${taskName}: ` : '';

			yield* Effect.logInfo(`${fullTaskName}Syncing creators`);
			yield* Effect.forEach(
				inputs,
				(input) =>
					syncCreator(input).pipe(
						Effect.matchEffect({
							onSuccess: () =>
								Ref.update(counts, ({ successCount, errorCount }) => ({
									successCount: successCount + 1,
									errorCount
								})),
							onFailure: (error) =>
								Ref.update(counts, ({ successCount, errorCount }) => ({
									successCount,
									errorCount: errorCount + 1
								})).pipe(
									Effect.andThen(
										Effect.logError(`${fullTaskName}Failed to sync creator`, error).pipe(
											Effect.annotateLogs({ ytChannelId: input.ytChannelId })
										)
									)
								)
						})
					),
				{ concurrency: 5 }
			);

			const { successCount, errorCount } = yield* Ref.get(counts);
			const end = yield* Clock.currentTimeMillis;
			yield* Effect.logInfo(
				`CREATOR SYNC COMPLETED: ${successCount} creators synced, ${errorCount} creators failed`
			);
			yield* Effect.logInfo(`CREATOR SYNC TOOK ${end - start}ms`);
		}).pipe(
			Effect.annotateLogs(taskName ? { taskName } : {}),
			Effect.withSpan('CreatorSync.syncCreators')
		);
	});

	return {
		syncCreator,
		syncCreators
	} as const;
});

type CreatorSyncShape = Effect.Success<typeof creatorSync>;

export class CreatorSync extends Context.Service<CreatorSync, CreatorSyncShape>()(
	'@hc/content-sync/creator-sync/CreatorSync',
	{ make: creatorSync }
) {
	static readonly layer = Layer.effect(this, this.make);
}
