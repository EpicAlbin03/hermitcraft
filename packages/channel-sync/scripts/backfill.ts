#!/usr/bin/env bun

import { ChannelSyncService, DbService } from '../src';
import { Console, Effect, Layer } from 'effect';
import { parseIdArgs } from './utils';

const main = Effect.gen(function* () {
	const channelSync = yield* ChannelSyncService;
	const db = yield* DbService;
	const id = parseIdArgs();

	if (id) {
		yield* Console.log(`Starting backfill for channel: ${id}`);
		yield* channelSync.backfillVideos(id);
	} else {
		yield* Console.log('No channel ID specified, backfilling all channels...');
		const channels = yield* db.getAllChannels();
		yield* Console.log(`Found ${channels.length} channels to backfill`);

		yield* Effect.forEach(channels, (channel) =>
			Effect.gen(function* () {
				yield* Console.log(`\nBackfilling channel: ${channel.ytName} (${channel.ytChannelId})`);
				yield* channelSync.backfillVideos(channel.ytChannelId).pipe(
					Effect.catchAll((err) => {
						console.error(`Failed to backfill ${channel.ytName} (${channel.ytChannelId}):`, err);
						return Effect.void;
					})
				);
			})
		);
	}
}).pipe(
	Effect.provide(Layer.provideMerge(ChannelSyncService.Default, DbService.Default)),
	Effect.matchCause({
		onSuccess: () => {
			console.log('Backfill completed successfully');
			process.exit(0);
		},
		onFailure: (cause) => {
			console.error('Backfill failed:', cause);
			process.exit(1);
		}
	})
);

Effect.runPromise(main);
