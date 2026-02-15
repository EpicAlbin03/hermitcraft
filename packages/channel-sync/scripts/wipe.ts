#!/usr/bin/env bun

import { Command, Options, Prompt } from '@effect/cli';
import { BunContext, BunRuntime } from '@effect/platform-bun';
import { Console, Effect, Layer, Option } from 'effect';
import { DbService } from '../src';
import { color, parseOperations, selectOperations } from './utils';

const id = Options.text('id').pipe(Options.withAlias('i'), Options.optional);
const yes = Options.boolean('yes').pipe(Options.withAlias('y'));
const all = Options.boolean('all').pipe(Options.withAlias('a'));
const ops = Options.text('ops').pipe(Options.withAlias('o'), Options.optional);

const command = Command.make('wipe', { id, yes, all, ops }, ({ id, yes, all, ops }) =>
	Effect.gen(function* () {
		const db = yield* DbService;
		const operations = parseOperations(Option.getOrUndefined(ops));

		const maybeId = Option.getOrUndefined(id);

		if (maybeId) {
			const { selected, names } = yield* selectOperations({
				operations: {
					channel: () => db.deleteChannel(maybeId),
					video: () => db.deleteVideo(maybeId)
				},
				promptLabel: 'Select what to wipe (channel or video)',
				autoSelect: operations,
				all
			});

			if (selected.length === 0) {
				yield* Console.log(color.warn('No valid selection. Aborting.'));
				return;
			}

			if (!yes) {
				const confirmed = yield* Prompt.confirm({
					message: `Delete ${names} with id "${maybeId}"?`
				});
				if (!confirmed) {
					yield* Console.log(color.warn('Aborted.'));
					return;
				}
			}

			yield* Console.log(color.action(`Running operations: ${names}`));

			yield* Effect.forEach(selected, ([name, wipe]) =>
				Effect.gen(function* () {
					yield* wipe();
					yield* Console.log(color.success(`Deleted ${name}: ${maybeId}`));
				})
			);

			return;
		}

		const { selected, names } = yield* selectOperations({
			operations: {
				videos: () => db.deleteAllVideos(),
				channels: () => db.deleteAllChannels()
			},
			promptLabel: 'Select tables to wipe',
			autoSelect: operations,
			all
		});

		if (selected.length === 0) {
			yield* Console.log(color.warn('No valid selection. Aborting.'));
			return;
		}

		if (!yes) {
			const confirmed = yield* Prompt.confirm({
				message: `Wipe the following: ${names}.`
			});

			if (!confirmed) {
				yield* Console.log(color.warn('Aborted.'));
				return;
			}
		}

		yield* Console.log(color.action(`Running operations: ${names}`));

		yield* Effect.forEach(selected, ([name, wipe]) =>
			Effect.gen(function* () {
				yield* wipe();
				yield* Console.log(color.success(`Wiped ${name}`));
			})
		);
	})
);

const program = (args: ReadonlyArray<string>) =>
	Effect.scoped(
		Effect.gen(function* () {
			yield* Command.run(command, {
				name: '@hc/channel-sync wipe',
				version: 'INTERNAL'
			})(args);
		})
	);

program(process.argv).pipe(
	Effect.provide(DbService.Default.pipe(Layer.provideMerge(BunContext.layer))),
	Effect.catchAllCause((cause) =>
		Effect.sync(() => {
			console.error(color.error('Wipe failed:'), cause);
			process.exit(1);
		})
	),
	BunRuntime.runMain
);
