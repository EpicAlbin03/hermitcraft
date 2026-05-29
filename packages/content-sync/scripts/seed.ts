#!/usr/bin/env bun

import { Command, Options, Prompt } from '@effect/cli';
import { BunContext, BunRuntime } from '@effect/platform-bun';
import { Cause, Console, Effect, Layer, Option } from 'effect';
import { ChannelSyncService, DbService } from '../src';
import { color, parseOperations, selectOperations } from './utils';
import { channels } from '../src/channels';

const id = Options.text('id').pipe(Options.withAlias('i'), Options.optional);
const yes = Options.boolean('yes').pipe(Options.withAlias('y'));
const all = Options.boolean('all').pipe(Options.withAlias('a'));
const ops = Options.text('ops').pipe(Options.withAlias('o'), Options.optional);

const command = Command.make('seed', { id, yes, all, ops }, ({ id, yes, all, ops }) =>
	Effect.gen(function* () {
		const channelSync = yield* ChannelSyncService;
		const operations = parseOperations(Option.getOrUndefined(ops));

		const maybeId = Option.getOrUndefined(id);

		if (maybeId) {
			const { selected, names } = yield* selectOperations({
				operations: {
					channel: () => {
						const channel = channels.find((c) => c.ytChannelId === maybeId);
						if (!channel || !channel.ytChannelId) {
							return Effect.die(`Channel ${maybeId} not found in channels list`);
						}
						return channelSync.syncChannel(channel.ytChannelId, {
							twitchUserId: channel.twitchUserId ?? undefined,
							twitchUserLogin: channel.twitchUserLogin ?? undefined,
							links: channel.links ?? []
						});
					},
					video: () => channelSync.syncVideo(maybeId)
				},
				promptLabel: 'Select what to seed (channel or video)',
				autoSelect: operations,
				all
			});

			if (selected.length === 0) {
				yield* Console.log(color.warn('No valid selection. Aborting.'));
				return;
			}

			if (!yes) {
				const confirmed = yield* Prompt.confirm({
					message: `Sync ${names} with id "${maybeId}"?`
				});
				if (!confirmed) {
					yield* Console.log(color.warn('Aborted.'));
					return;
				}
			}

			yield* Console.log(color.action(`Running operations: ${names}`));

			yield* Effect.forEach(selected, ([name, sync]) =>
				Effect.gen(function* () {
					yield* sync();
					yield* Console.log(color.success(`Synced ${name}: ${maybeId}`));
				})
			);

			if (selected.some(([name]) => name === 'channel')) {
				yield* channelSync.syncTwitchLive();
				yield* Console.log(color.success('Synced twitch live'));
				yield* channelSync.syncYoutubeLive();
				yield* Console.log(color.success('Synced youtube live'));
			}

			return;
		}

		const ytChannelIds = channels.map((c) => c.ytChannelId);

		const { selected, names } = yield* selectOperations({
			operations: {
				channels: () =>
					channelSync.syncChannels(
						channels.map((c) => ({
							ytChannelId: c.ytChannelId,
							twitchUserId: c.twitchUserId ?? undefined,
							twitchUserLogin: c.twitchUserLogin ?? undefined,
							links: c.links ?? []
						}))
					),
				videos: () => channelSync.syncVideos(ytChannelIds, { maxResults: 15 })
			},
			promptLabel: 'Select tables to seed',
			autoSelect: operations,
			all
		});

		if (selected.length === 0) {
			yield* Console.log(color.warn('No valid selection. Aborting.'));
			return;
		}

		if (!yes) {
			const confirmed = yield* Prompt.confirm({
				message: `Sync the following: ${names}.`
			});

			if (!confirmed) {
				yield* Console.log(color.warn('Aborted.'));
				return;
			}
		}

		yield* Console.log(color.action(`Running operations: ${names}`));

		yield* Effect.forEach(selected, ([name, sync]) =>
			Effect.gen(function* () {
				yield* sync();
				yield* Console.log(color.success(`Synced ${name}`));
			})
		);

		if (selected.some(([name]) => name === 'channels')) {
			yield* channelSync.syncTwitchLive();
			yield* Console.log(color.success('Synced twitch live'));
			yield* channelSync.syncYoutubeLive();
			yield* Console.log(color.success('Synced youtube live'));
		}
	})
);

const program = (args: ReadonlyArray<string>) =>
	Effect.scoped(
		Effect.gen(function* () {
			yield* Command.run(command, {
				name: '@hc/channel-sync seed',
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
			console.error(color.error('Seed failed:'), Cause.pretty(cause));
			process.exit(1);
		})
	),
	BunRuntime.runMain
);
