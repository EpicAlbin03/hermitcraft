import type { Creator, CreatorLink } from '@hc/db/schema';
import * as Context from 'effect/Context';
import * as Data from 'effect/Data';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import { DbService } from './db-service';

class CreatorCatalogError extends Data.TaggedError('CreatorCatalogError')<{
	message: string;
	cause?: unknown;
}> {}

export type CreatorCatalogEntry = Creator;

export type CreatorCatalogSyncInput = {
	ytChannelId: string;
	twitchUserId?: string | null;
	twitchUserLogin?: string | null;
	links?: CreatorLink[];
};

export type CreatorCatalogSnapshot = Pick<
	Creator,
	| 'ytChannelId'
	| 'ytName'
	| 'ytHandle'
	| 'ytDescription'
	| 'ytAvatarUrl'
	| 'ytBannerUrl'
	| 'ytBannerThumbHash'
	| 'ytViewCount'
	| 'ytSubscriberCount'
	| 'ytVideoCount'
	| 'ytJoinedAt'
>;

const creatorCatalog = Effect.gen(function* () {
	const db = yield* DbService;

	const listTrackedCreators = Effect.fn('listTrackedCreators')(function* () {
		return yield* db
			.getAllCreators()
			.pipe(
				Effect.mapError(
					(err) => new CreatorCatalogError({ message: err.message, cause: err.cause })
				)
			);
	});

	const listTrackedCreatorsByIds = Effect.fn('listTrackedCreatorsByIds')(function* (
		ytChannelIds: string[]
	) {
		return yield* db
			.getCreators(ytChannelIds)
			.pipe(
				Effect.mapError(
					(err) => new CreatorCatalogError({ message: err.message, cause: err.cause })
				)
			);
	});

	const listTrackedCreatorIds = Effect.fn('listTrackedCreatorIds')(function* () {
		const creators = yield* listTrackedCreators();
		return creators.map((creator) => creator.ytChannelId);
	});

	const getTrackedCreator = Effect.fn('getTrackedCreator')(function* (ytChannelId: string) {
		return yield* db
			.getCreator(ytChannelId)
			.pipe(
				Effect.mapError(
					(err) => new CreatorCatalogError({ message: err.message, cause: err.cause })
				)
			);
	});

	const upsertTrackedCreatorFromSnapshot = Effect.fn('upsertTrackedCreatorFromSnapshot')(function* (
		input: CreatorCatalogSyncInput,
		snapshot: CreatorCatalogSnapshot
	) {
		const existingCreator = yield* getTrackedCreator(input.ytChannelId);
		const storedCreator = Option.getOrUndefined(existingCreator);

		return yield* db
			.upsertCreator({
				...snapshot,
				twitchUserId: input.twitchUserId ?? storedCreator?.twitchUserId ?? null,
				twitchUserLogin: input.twitchUserLogin ?? storedCreator?.twitchUserLogin ?? null,
				isTwitchLive: storedCreator?.isTwitchLive ?? false,
				links: input.links ?? storedCreator?.links ?? []
			})
			.pipe(
				Effect.mapError(
					(err) => new CreatorCatalogError({ message: err.message, cause: err.cause })
				)
			);
	});

	const setTrackedCreatorTwitchLiveStatuses = Effect.fn('setTrackedCreatorTwitchLiveStatuses')(
		function* (updates: Array<{ ytChannelId: string; isTwitchLive: boolean }>) {
			return yield* db
				.setCreatorTwitchLiveStatuses(updates)
				.pipe(
					Effect.mapError(
						(err) => new CreatorCatalogError({ message: err.message, cause: err.cause })
					)
				);
		}
	);

	return {
		listTrackedCreators,
		listTrackedCreatorsByIds,
		listTrackedCreatorIds,
		getTrackedCreator,
		upsertTrackedCreatorFromSnapshot,
		setTrackedCreatorTwitchLiveStatuses
	} as const;
});

type CreatorCatalogShape = Effect.Success<typeof creatorCatalog>;

export class CreatorCatalog extends Context.Service<CreatorCatalog, CreatorCatalogShape>()(
	'@hc/content-sync/creator-catalog/CreatorCatalog',
	{ make: creatorCatalog }
) {
	static readonly layer = Layer.effect(this, this.make);
}
