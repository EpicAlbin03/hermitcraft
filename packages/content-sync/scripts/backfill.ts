#!/usr/bin/env bun

import { Command, Options } from '@effect/cli';
import { BunContext, BunRuntime } from '@effect/platform-bun';
import { ChannelSyncService, DbService } from '../src';
import { Console, Effect, Layer, Option } from 'effect';
import { color } from './utils';
import { DB_SCHEMA } from '@hc/db';

const id = Options.text('id').pipe(Options.withAlias('i'), Options.optional);

const command = Command.make('backfill', { id }, ({ id }) =>
	Effect.gen(function* () {
		const channelSync = yield* ChannelSyncService;
		const db = yield* DbService;

		const maybeId = Option.getOrUndefined(id);

		if (maybeId) {
			yield* Console.log(color.action(`Starting backfill for channel: ${maybeId}`));
			yield* channelSync.syncVideos([maybeId], {
				backfill: true,
				taskName: 'BACKFILL',
				maxResults: 100
			});
			yield* Console.log(color.success(`Backfilled channel: ${maybeId}`));
			return;
		}

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
	})
);

const program = (args: ReadonlyArray<string>) =>
	Effect.scoped(
		Effect.gen(function* () {
			yield* Command.run(command, {
				name: '@hc/channel-sync backfill',
				version: 'INTERNAL'
			})(args);
		})
	);

const MainLayer = ChannelSyncService.Default.pipe(
	Layer.provideMerge(DbService.Default),
	Layer.provideMerge(BunContext.layer)
);

program(process.argv).pipe(
	Effect.provide(MainLayer),
	Effect.catchAllCause((cause) =>
		Effect.sync(() => {
			console.error(color.error('Backfill failed:'), cause);
			process.exit(1);
		})
	),
	BunRuntime.runMain
);
