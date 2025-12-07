#!/usr/bin/env bun

import { Effect } from 'effect';
import { DbService } from '../src';
import { askQuestion, parseIdArgs, selectOperations } from './utils';

const main = Effect.gen(function* () {
	const db = yield* DbService;
	const id = parseIdArgs();

	if (id) {
		const { selected, names } = yield* selectOperations({
			operations: {
				channel: () => db.deleteChannel(id),
				video: () => db.deleteVideo(id)
			},
			prompt: 'Select what to wipe (channel or video)'
		});

		if (selected.length === 0) {
			console.log('No valid selection. Aborting.');
			return;
		}

		const confirmation = yield* askQuestion(`Delete ${names} with id "${id}"? Type "yes": `);
		if (confirmation.trim() !== 'yes') {
			console.log('Aborted.');
			return;
		}

		for (const [name, wipe] of selected) {
			yield* wipe();
			console.log(`Deleted ${name}: ${id}`);
		}
	} else {
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
	}
}).pipe(
	Effect.provide(DbService.Default),
	Effect.matchCause({
		onSuccess: () => {
			console.log('DB wipe completed successfully');
			process.exit(0);
		},
		onFailure: (cause) => {
			console.error('Wipe failed:', cause);
			process.exit(1);
		}
	})
);

Effect.runPromise(main);
