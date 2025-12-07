#!/usr/bin/env bun

import { Effect, Layer } from 'effect';
import { ChannelSyncService, DbService } from '../src';
import { askQuestion, selectOperations } from './utils';
import { channelIds, twitchUserIds } from '../src/youtube/utils';

const main = Effect.gen(function* () {
	const channelSync = yield* ChannelSyncService;

	const ytChannelIds = channelIds.map((c) => c.id);
	const twitchUserIdsList = twitchUserIds.map((c) => c.id);
	const channels = ytChannelIds.map((ytChannelId, index) => ({
		ytChannelId,
		twitchUserId: twitchUserIdsList[index] ?? ''
	}));

	const { selected, names } = yield* selectOperations({
		operations: {
			channels: () => channelSync.syncChannels(channels),
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
