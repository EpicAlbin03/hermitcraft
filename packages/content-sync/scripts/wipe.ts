#!/usr/bin/env bun

import {
	BunChildProcessSpawner,
	BunFileSystem,
	BunPath,
	BunRuntime,
	BunStdio,
	BunTerminal
} from '@effect/platform-bun';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import { Command, Flag } from 'effect/unstable/cli';
import { DbService } from '../src/db-service';
import { contentSyncLayer } from '../src/layer';
import { parseOperations, runOperationSelection } from './utils';

const wipeCommand = Command.make(
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
			return yield* runOperationSelection({
				operations: {
					creator: () => db.deleteCreator(targetId).pipe(Effect.asVoid),
					video: () => db.deleteVideo(targetId).pipe(Effect.asVoid)
				},
				promptLabel: 'Select what to wipe',
				autoSelect: operations,
				all,
				yes,
				confirmMessage: (names) => `Delete ${names} with id "${targetId}"?`,
				successMessage: (name) => `Deleted ${name}: ${targetId}`
			});
		}

		return yield* runOperationSelection({
			operations: {
				videos: () => db.deleteAllVideos().pipe(Effect.asVoid),
				creators: () => db.deleteAllCreators().pipe(Effect.asVoid)
			},
			promptLabel: 'Select what to wipe',
			autoSelect: operations,
			all,
			yes,
			confirmMessage: (names) => `Wipe the following: ${names}?`,
			successMessage: (name) => `Wiped ${name}`
		});
	})
).pipe(Command.withDescription('Delete creator and video records from the database'));

const bunCommandLayer = BunChildProcessSpawner.layer.pipe(
	Layer.provideMerge(
		Layer.mergeAll(BunFileSystem.layer, BunPath.layer, BunStdio.layer, BunTerminal.layer)
	)
);

Command.run(wipeCommand, { version: 'INTERNAL' }).pipe(
	Effect.provide(Layer.merge(contentSyncLayer, bunCommandLayer)),
	BunRuntime.runMain
);
