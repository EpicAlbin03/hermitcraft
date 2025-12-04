#!/usr/bin/env bun

import { Effect } from 'effect';
import { DbService } from '../src';
import { askQuestion, selectOperations } from './utils';

const main = Effect.gen(function* () {
	const db = yield* DbService;

	const { selected, names } = yield* selectOperations({
		operations: {
			videos: () => db.deleteAllVideos(),
			channels: () => db.deleteAllChannels()
		},
		prompt: 'Select tables to wipe'
	});

	if (selected.length === 0) {
		console.log('No valid tables selected. Aborting.');
		return;
	}

	const confirmation = yield* askQuestion(
		`This will wipe the following tables: ${names}. Type "yes" to continue: `
	);

	if (confirmation.trim() !== 'yes') {
		console.log('Aborted.');
		return;
	}

	console.log(`Wiping DB tables: ${names}...`);

	for (const [name, wipe] of selected) {
		yield* wipe();
		console.log(`Wiped ${name}`);
	}
}).pipe(
	Effect.provide(DbService.Default),
	Effect.matchCause({
		onSuccess: () => {
			console.log('DB tables wiped successfully');
			process.exit(0);
		},
		onFailure: (cause) => {
			console.error('Wipe failed:', cause);
			process.exit(1);
		}
	})
);

Effect.runPromise(main);
