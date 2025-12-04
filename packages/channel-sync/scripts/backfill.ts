#!/usr/bin/env bun

import { ChannelSyncService, DbService } from '../src';
import { Effect, Layer } from 'effect';
import { parseArgs } from 'util';

const main = Effect.gen(function* () {
	const { values } = parseArgs({
		args: Bun.argv,
		options: {
			id: {
				type: 'string',
				short: 'i'
			}
		},
		strict: true,
		allowPositionals: true
	});

	const channelSync = yield* ChannelSyncService;
	const db = yield* DbService;

	if (values.id) {
		console.log(`Starting backfill for channel: ${values.id}`);
		yield* channelSync.backfillChannel({ ytChannelId: values.id });
	} else {
		console.log('No channel ID specified, backfilling all channels...');
		const channels = yield* db.getAllChannels();
		console.log(`Found ${channels.length} channels to backfill`);

		for (const channel of channels) {
			console.log(`\nBackfilling channel: ${channel.name} (${channel.ytChannelId})`);
			yield* channelSync.backfillChannel({ ytChannelId: channel.ytChannelId }).pipe(
				Effect.catchAll((err) => {
					console.error(`Failed to backfill ${channel.name}:`, err);
					return Effect.void;
				})
			);
		}
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
