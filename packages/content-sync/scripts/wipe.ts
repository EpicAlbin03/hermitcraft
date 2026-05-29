#!/usr/bin/env bun

import { BunRuntime, BunServices } from '@effect/platform-bun';
import * as Console from 'effect/Console';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import { Command, Flag, Prompt } from 'effect/unstable/cli';
import { DbService } from '../src/db-service';
import { contentSyncLayer } from '../src/layer';
import { color, parseOperations, selectOperations } from './utils';

const command = Command.make(
	'wipe',
	{
		id: Flag.string('id').pipe(Flag.withAlias('i'), Flag.optional),
		yes: Flag.boolean('yes').pipe(Flag.withAlias('y')),
		all: Flag.boolean('all').pipe(Flag.withAlias('a')),
		ops: Flag.string('ops').pipe(Flag.withAlias('o'), Flag.optional)
	},
	Effect.fn(function* ({ id, yes, all, ops }) {
		const db = yield* DbService;
		const targetId = Option.getOrUndefined(id);
		const operations = parseOperations(Option.getOrUndefined(ops));

		if (targetId) {
			const { selected, names } = yield* selectOperations({
				operations: {
					creator: () => db.deleteCreator(targetId).pipe(Effect.asVoid),
					video: () => db.deleteVideo(targetId).pipe(Effect.asVoid)
				},
				promptLabel: 'Select what to wipe',
				autoSelect: operations,
				all
			});

			if (selected.length === 0) {
				yield* Console.log(color.warn('No valid selection. Aborting.'));
				return;
			}

			if (!yes) {
				const confirmed = yield* Prompt.confirm({
					message: `Delete ${names} with id "${targetId}"?`,
					initial: false
				});
				if (!confirmed) {
					yield* Console.log(color.warn('Aborted.'));
					return;
				}
			}

			yield* Console.log(color.action(`Running operations: ${names}`));
			yield* Effect.forEach(selected, ([name, run]) =>
				run().pipe(Effect.tap(() => Console.log(color.success(`Deleted ${name}: ${targetId}`))))
			);
			return;
		}

		const { selected, names } = yield* selectOperations({
			operations: {
				videos: () => db.deleteAllVideos().pipe(Effect.asVoid),
				creators: () => db.deleteAllCreators().pipe(Effect.asVoid)
			},
			promptLabel: 'Select what to wipe',
			autoSelect: operations,
			all
		});

		if (selected.length === 0) {
			yield* Console.log(color.warn('No valid selection. Aborting.'));
			return;
		}

		if (!yes) {
			const confirmed = yield* Prompt.confirm({
				message: `Wipe the following: ${names}?`,
				initial: false
			});
			if (!confirmed) {
				yield* Console.log(color.warn('Aborted.'));
				return;
			}
		}

		yield* Console.log(color.action(`Running operations: ${names}`));
		yield* Effect.forEach(selected, ([name, run]) =>
			run().pipe(Effect.tap(() => Console.log(color.success(`Wiped ${name}`))))
		);
	})
).pipe(Command.withDescription('Delete creator and video records from the database'));

Command.run(command, { version: 'INTERNAL' }).pipe(
	Effect.provide(Layer.merge(contentSyncLayer, BunServices.layer)),
	BunRuntime.runMain
);
