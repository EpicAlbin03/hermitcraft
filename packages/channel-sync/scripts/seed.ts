#!/usr/bin/env bun

import { Effect, Layer } from 'effect';
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
					if (!channel) return Effect.die(`Channel ${id} not found in channels list`);
					return channelSync.syncChannel({
						ytChannelId: channel.ytChannelId,
						twitchUserId: channel.twitchUserId,
						twitchUsername: channel.twitchUsername
					});
				},
				video: () => channelSync.syncVideo({ ytVideoId: id })
			},
			prompt: 'Select what to seed (channel or video)'
		});

		if (selected.length === 0) {
			console.log('No valid selection. Aborting.');
			return;
		}

		const confirmation = yield* askQuestion(`Sync ${names} with id "${id}"? Type "yes": `);
		if (confirmation.trim() !== 'yes') {
			console.log('Aborted.');
			return;
		}

		for (const [name, sync] of selected) {
			yield* sync();
			console.log(`Synced ${name}: ${id}`);
		}
	} else {
		const ytChannelIds = channels.map((c) => c.ytChannelId);

		const { selected, names } = yield* selectOperations({
			operations: {
				channels: () =>
					channelSync.syncChannels(
						channels.map((c) => ({
							ytChannelId: c.ytChannelId,
							twitchUserId: c.twitchUserId,
							twitchUsername: c.twitchUsername
						}))
					),
				videos: () => channelSync.syncVideos({ ytChannelIds })
			},
			prompt: 'Select tables to seed'
		});

		if (selected.length === 0) {
			console.log('No valid tables selected. Aborting.');
			return;
		}

		const confirmation = yield* askQuestion(
			`This will sync the following tables: ${names}. Type "yes" to continue: `
		);

		if (confirmation.trim() !== 'yes') {
			console.log('Aborted.');
			return;
		}

		console.log(`Seeding: ${names}...`);

		for (const [name, sync] of selected) {
			yield* sync();
			console.log(`Synced ${name}`);
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
			console.error('Seed failed:', cause);
			process.exit(1);
		}
	})
);

Effect.runPromise(main);
