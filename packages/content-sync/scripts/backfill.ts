#!/usr/bin/env bun

import { BunRuntime } from '@effect/platform-bun';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import { Command, Flag } from 'effect/unstable/cli';
import { CreatorCatalog } from '../src/creator-catalog';
import { VideoSync } from '../src/video-sync';
import { provideContentSyncCommand } from './runtime';
import { color } from './utils';

const backfillCommand = Command.make(
	'backfill',
	{
		id: Flag.string('id').pipe(Flag.withAlias('i'), Flag.optional)
	},
	Effect.fn(function* ({ id }) {
		const creatorCatalog = yield* CreatorCatalog;
		const videoSync = yield* VideoSync;
		const ytChannelId = Option.getOrUndefined(id);

		if (ytChannelId) {
			yield* Effect.log(color.action(`Starting video backfill for creator: ${ytChannelId}`));
			yield* videoSync.syncVideosForCreators([ytChannelId], {
				backfill: true,
				taskName: 'BACKFILL',
				maxResults: 100
			});
			yield* Effect.log(color.success(`Backfilled creator: ${ytChannelId}`));
			return;
		}

		const ytChannelIds = yield* creatorCatalog.listTrackedCreatorIds();
		yield* Effect.log(color.info(`Found ${ytChannelIds.length} tracked creators to backfill.`));
		yield* Effect.forEach(
			ytChannelIds,
			(currentYtChannelId) =>
				videoSync
					.syncVideosForCreators([currentYtChannelId], {
						backfill: true,
						taskName: 'BACKFILL',
						maxResults: 100
					})
					.pipe(
						Effect.tap(() =>
							Effect.log(color.success(`Backfilled creator: ${currentYtChannelId}`))
						),
						Effect.catch((error) =>
							Effect.logError(
								color.error(`Failed to backfill creator: ${currentYtChannelId}`),
								error
							)
						)
					),
			{ concurrency: 5 }
		);
		yield* Effect.log(
			color.success(`Finished backfill run for ${ytChannelIds.length} tracked creators.`)
		);
	})
).pipe(Command.withDescription('Backfill videos for tracked creators'));

BunRuntime.runMain(provideContentSyncCommand(backfillCommand));
