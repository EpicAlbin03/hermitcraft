#!/usr/bin/env bun

import { BunRuntime, BunServices } from '@effect/platform-bun';
import * as Console from 'effect/Console';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import { Command, Flag } from 'effect/unstable/cli';
import { CreatorCatalog } from '../src/creator-catalog';
import { contentSyncLayer } from '../src/layer';
import { VideoSync } from '../src/video-sync';
import { color } from './utils';

const command = Command.make(
	'backfill',
	{
		id: Flag.string('id').pipe(Flag.withAlias('i'), Flag.optional)
	},
	Effect.fn(function* ({ id }) {
		const creatorCatalog = yield* CreatorCatalog;
		const videoSync = yield* VideoSync;
		const ytChannelId = Option.getOrUndefined(id);

		if (ytChannelId) {
			yield* Console.log(color.action(`Starting video backfill for creator: ${ytChannelId}`));
			yield* videoSync.syncVideosForCreators([ytChannelId], {
				backfill: true,
				taskName: 'BACKFILL',
				maxResults: 100
			});
			yield* Console.log(color.success(`Backfilled creator: ${ytChannelId}`));
			return;
		}

		const ytChannelIds = yield* creatorCatalog.listTrackedCreatorIds();
		yield* Console.log(color.info(`Found ${ytChannelIds.length} tracked creators to backfill.`));
		yield* videoSync.syncVideosForCreators(ytChannelIds, {
			backfill: true,
			taskName: 'BACKFILL',
			maxResults: 100
		});
		yield* Console.log(color.success(`Backfilled ${ytChannelIds.length} tracked creators.`));
	})
).pipe(Command.withDescription('Backfill videos for tracked creators'));

Command.run(command, { version: 'INTERNAL' }).pipe(
	Effect.provide(Layer.merge(contentSyncLayer, BunServices.layer)),
	BunRuntime.runMain
);
