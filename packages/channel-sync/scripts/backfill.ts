#!/usr/bin/env bun

import { ChannelSyncService, DbService } from '../src';
import { Console, Effect, Layer } from 'effect';
import { color, parseIdArgs } from './utils';
import { DB_SCHEMA } from '@hc/db';

const main = Effect.gen(function* () {
	const channelSync = yield* ChannelSyncService;
	const db = yield* DbService;
	const id = parseIdArgs();

	if (id) {
		yield* Console.log(color.action(`Starting backfill for channel: ${id}`));
		yield* channelSync.syncVideos([id], { backfill: true, taskName: 'BACKFILL', maxResults: 100 });
		yield* Console.log(color.success(`Backfilled channel: ${id}`));
	} else {
		yield* Console.log(color.info('No channel ID specified; backfilling all channels.'));
		const channels = yield* db.getAllChannels({
			ytChannelId: DB_SCHEMA.channels.ytChannelId,
			ytName: DB_SCHEMA.channels.ytName
		});
		yield* Console.log(color.info(`Found ${channels.length} channels to backfill.`));

		yield* Effect.forEach(channels, (channel) =>
			Effect.gen(function* () {
				yield* Console.log(
					color.action(`Backfilling channel: ${channel.ytName} (${channel.ytChannelId})`)
				);
				yield* channelSync
					.syncVideos([channel.ytChannelId], {
						backfill: true,
						taskName: 'BACKFILL',
						maxResults: 100
					})
					.pipe(
						Effect.catchAll((err) => {
							console.error(
								color.error(`Failed to backfill ${channel.ytName} (${channel.ytChannelId}):`),
								err
							);
							return Effect.void;
						})
					);
				yield* Console.log(
					color.success(`Backfilled channel: ${channel.ytName} (${channel.ytChannelId})`)
				);
			})
		);
	}
}).pipe(
	Effect.provide(Layer.provideMerge(ChannelSyncService.Default, DbService.Default)),
	Effect.matchCause({
		onSuccess: () => {
			console.log(color.success('Backfill completed successfully'));
			process.exit(0);
		},
		onFailure: (cause) => {
			console.error(color.error('Backfill failed:'), cause);
			process.exit(1);
		}
	})
);

Effect.runPromise(main);
