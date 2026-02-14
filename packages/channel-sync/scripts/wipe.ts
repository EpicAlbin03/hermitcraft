#!/usr/bin/env bun

import { Console, Effect } from 'effect';
import { DbService } from '../src';
import { askQuestion, color, parseIdArgs, prompt, selectOperations } from './utils';

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
			yield* Console.log(color.warn('No valid selection. Aborting.'));
			return;
		}

		const confirmation = yield* askQuestion(
			prompt.confirmTypeYes(`Delete ${names} with id "${id}"?`)
		);
		if (confirmation.trim() !== 'yes') {
			yield* Console.log(color.warn('Aborted.'));
			return;
		}

		yield* Console.log(color.action(`Running operations: ${names}`));

		yield* Effect.forEach(selected, ([name, wipe]) =>
			Effect.gen(function* () {
				yield* wipe();
				yield* Console.log(color.success(`Deleted ${name}: ${id}`));
			})
		);
	} else {
		const { selected, names } = yield* selectOperations({
			operations: {
				videos: () => db.deleteAllVideos(),
				channels: () => db.deleteAllChannels()
			},
			prompt: 'Select tables to wipe'
		});

		if (selected.length === 0) {
			yield* Console.log(color.warn('No valid selection. Aborting.'));
			return;
		}

		const confirmation = yield* askQuestion(prompt.confirmTypeYes(`Wipe the following: ${names}.`));

		if (confirmation.trim() !== 'yes') {
			yield* Console.log(color.warn('Aborted.'));
			return;
		}

		yield* Console.log(color.action(`Running operations: ${names}`));

		yield* Effect.forEach(selected, ([name, wipe]) =>
			Effect.gen(function* () {
				yield* wipe();
				yield* Console.log(color.success(`Wiped ${name}`));
			})
		);
	}
}).pipe(
	Effect.provide(DbService.Default),
	Effect.matchCause({
		onSuccess: () => {
			console.log(color.success('DB wipe completed successfully'));
			process.exit(0);
		},
		onFailure: (cause) => {
			console.error(color.error('Wipe failed:'), cause);
			process.exit(1);
		}
	})
);

Effect.runPromise(main);
