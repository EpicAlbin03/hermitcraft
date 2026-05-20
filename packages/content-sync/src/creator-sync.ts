import type { ChannelLink } from '@hc/db/schema';
import * as Context from 'effect/Context';
import * as Data from 'effect/Data';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import { DbService } from './db-service';
import { YoutubeService } from './yt-service';

class CreatorSyncError extends Data.TaggedError('CreatorSyncError')<{
	message: string;
	cause?: unknown;
}> {}

export type CreatorSyncInput = {
	ytChannelId: string;
	twitchUserId?: string | null;
	twitchUserLogin?: string | null;
	links?: ChannelLink[];
};

const creatorSync = Effect.gen(function* () {
	const db = yield* DbService;
	const yt = yield* YoutubeService;

	const syncCreator = Effect.fn('syncCreator')(function* (input: CreatorSyncInput) {
		return yield* Effect.gen(function* () {
			const existingCreator = yield* db.getChannel(input.ytChannelId);
			const channelDetails = yield* yt.getChannelDetails(input.ytChannelId);

			const storedCreator = Option.getOrUndefined(existingCreator);

			yield* db.upsertChannel({
				ytChannelId: input.ytChannelId,
				ytName: channelDetails.ytName,
				ytHandle: channelDetails.ytHandle,
				ytDescription: channelDetails.ytDescription,
				ytAvatarUrl: channelDetails.ytAvatarUrl,
				ytBannerUrl: channelDetails.ytBannerUrl,
				ytBannerThumbHash: channelDetails.ytBannerThumbHash,
				ytViewCount: channelDetails.ytViewCount,
				ytSubscriberCount: channelDetails.ytSubscriberCount,
				ytVideoCount: channelDetails.ytVideoCount,
				ytJoinedAt: channelDetails.ytJoinedAt,
				twitchUserId: input.twitchUserId ?? storedCreator?.twitchUserId ?? null,
				twitchUserLogin: input.twitchUserLogin ?? storedCreator?.twitchUserLogin ?? null,
				isTwitchLive: storedCreator?.isTwitchLive ?? false,
				ytLiveVideoId: storedCreator?.ytLiveVideoId ?? null,
				links: input.links ?? storedCreator?.links ?? []
			});
		}).pipe(
			Effect.catchTag(
				'DbError',
				(err) => new CreatorSyncError({ message: `DB ERROR: ${err.message}`, cause: err.cause })
			),
			Effect.catchTag(
				'YoutubeError',
				(err) =>
					new CreatorSyncError({ message: `YOUTUBE ERROR: ${err.message}`, cause: err.cause })
			)
		);
	});

	const syncCreators = Effect.fn('syncCreators')(function* (
		inputs: CreatorSyncInput[],
		taskName?: string
	) {
		const start = performance.now();
		let successCount = 0;
		let errorCount = 0;
		const fullTaskName = taskName ? `${taskName}: ` : '';

		yield* Effect.logInfo(`${fullTaskName}Syncing channels`);
		yield* Effect.forEach(
			inputs,
			(input) =>
				syncCreator(input).pipe(
					Effect.matchEffect({
						onSuccess: () => Effect.sync(() => successCount++),
						onFailure: (error) =>
							Effect.sync(() => {
								errorCount++;
							}).pipe(
								Effect.andThen(Effect.logError(`${fullTaskName}Failed to sync channel`, error))
							)
					})
				),
			{ concurrency: 5 }
		);

		yield* Effect.logInfo(
			`CHANNEL SYNC COMPLETED: ${successCount} channels synced, ${errorCount} channels failed`
		);
		yield* Effect.logInfo(`CHANNEL SYNC TOOK ${performance.now() - start}ms`);
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
