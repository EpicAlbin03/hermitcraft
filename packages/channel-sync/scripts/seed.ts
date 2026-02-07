#!/usr/bin/env bun

import { Cause, Console, Effect, Layer } from 'effect';
import { ChannelSyncService, DbService } from '../src';
import { askQuestion, parseIdArgs, selectOperations } from './utils';
import { channels } from '../src/channels';

const main = Effect.gen(function* () {
	const channelSync = yield* ChannelSyncService;
	const id = parseIdArgs();

	if (id) {
		const { selected, names } = yield* selectOperations({
			operations: {
				channel: () => {
					const channel = channels.find((c) => c.ytChannelId === id);
					if (!channel || !channel.ytChannelId) {
						return Effect.die(`Channel ${id} not found in channels list`);
					}
					return channelSync.syncChannel(channel.ytChannelId, {
						twitchUserId: channel.twitchUserId ?? undefined,
						twitchUserLogin: channel.twitchUserLogin ?? undefined,
						links: channel.links ?? []
					});
				},
				video: () => channelSync.syncVideo(id)
			},
			prompt: 'Select what to seed (channel or video)'
		});

		if (selected.length === 0) {
			yield* Console.log('No valid selection. Aborting.');
			return;
		}

		const confirmation = yield* askQuestion(`Sync ${names} with id "${id}"? Type "yes": `);
		if (confirmation.trim() !== 'yes') {
			yield* Console.log('Aborted.');
			return;
		}

		yield* Effect.forEach(selected, ([name, sync]) =>
			Effect.gen(function* () {
				yield* sync();
				yield* Console.log(`Synced ${name}: ${id}`);
			})
		);

		if (selected.some(([name]) => name === 'channel')) {
			yield* channelSync.syncTwitchLive();
			yield* Console.log('Synced twitch live');
			yield* channelSync.syncYoutubeLive();
			yield* Console.log('Synced youtube live');
		}
	} else {
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
			prompt: 'Select tables to seed'
		});

		if (selected.length === 0) {
			yield* Console.log('No valid tables selected. Aborting.');
			return;
		}

		const confirmation = yield* askQuestion(
			`This will sync the following tables: ${names}. Type "yes" to continue: `
		);

		if (confirmation.trim() !== 'yes') {
			yield* Console.log('Aborted.');
			return;
		}

		yield* Console.log(`Seeding: ${names}...`);

		yield* Effect.forEach(selected, ([name, sync]) =>
			Effect.gen(function* () {
				yield* sync();
				yield* Console.log(`Synced ${name}`);
			})
		);

		if (selected.some(([name]) => name === 'channels')) {
			yield* channelSync.syncTwitchLive();
			yield* Console.log('Synced twitch live');
			yield* channelSync.syncYoutubeLive();
			yield* Console.log('Synced youtube live');
		}
	}
}).pipe(
	Effect.provide(ChannelSyncService.Default.pipe(Layer.provide(DbService.Default))),
	Effect.matchCause({
		onSuccess: () => {
			console.log('Seed completed successfully');
			process.exit(0);
		},
		onFailure: (cause) => {
			console.error('Seed failed:', Cause.pretty(cause));
			process.exit(1);
		}
	})
);

Effect.runPromise(main);
