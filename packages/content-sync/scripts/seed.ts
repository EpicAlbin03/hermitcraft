#!/usr/bin/env bun

import { BunRuntime, BunServices } from '@effect/platform-bun';
import * as Console from 'effect/Console';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import { Command, Flag, Prompt } from 'effect/unstable/cli';
import { creators } from '../src/creators';
import { CreatorSync } from '../src/creator-sync';
import { contentSyncLayer } from '../src/layer';
import { TwitchLiveStatusSync } from '../src/twitch-live-status-sync';
import { VideoSync } from '../src/video-sync';
import { color, ScriptError, parseOperations, selectOperations } from './utils';

const mapOperationError = (name: string) =>
	Effect.mapError((cause: unknown) => new ScriptError({ message: `Failed to run ${name}`, cause }));

const command = Command.make(
	'seed',
	{
		id: Flag.string('id').pipe(Flag.withAlias('i'), Flag.optional),
		yes: Flag.boolean('yes').pipe(Flag.withAlias('y')),
		all: Flag.boolean('all').pipe(Flag.withAlias('a')),
		ops: Flag.string('ops').pipe(Flag.withAlias('o'), Flag.optional)
	},
	Effect.fn(function* ({ id, yes, all, ops }) {
		const creatorSync = yield* CreatorSync;
		const videoSync = yield* VideoSync;
		const twitchLiveStatusSync = yield* TwitchLiveStatusSync;
		const ytChannelId = Option.getOrUndefined(id);
		const operations = parseOperations(Option.getOrUndefined(ops));

		if (ytChannelId) {
			const creator = creators.find((entry) => entry.ytChannelId === ytChannelId);

			if (!creator) {
				return yield* new ScriptError({
					message: `Creator ${ytChannelId} not found in the tracked creator list`
				});
			}

			const { selected, names } = yield* selectOperations({
				operations: {
					creator: () => creatorSync.syncCreator(creator).pipe(mapOperationError('creator sync')),
					videos: () =>
						videoSync
							.syncVideosForCreators([ytChannelId], {
								taskName: 'SEED',
								maxResults: 15
							})
							.pipe(mapOperationError('video sync')),
					youtubeLiveStatus: () =>
						videoSync
							.refreshYtLiveStatus([ytChannelId], 'SEED')
							.pipe(mapOperationError('YouTube live status sync'))
				},
				promptLabel: 'Select creator operations',
				autoSelect: operations,
				all
			});

			if (selected.length === 0) {
				yield* Console.log(color.warn('No valid selection. Aborting.'));
				return;
			}

			if (!yes) {
				const confirmed = yield* Prompt.confirm({
					message: `Run ${names} for creator "${ytChannelId}"?`,
					initial: false
				});
				if (!confirmed) {
					yield* Console.log(color.warn('Aborted.'));
					return;
				}
			}

			yield* Console.log(color.action(`Running operations: ${names}`));
			yield* Effect.forEach(selected, ([name, run]) =>
				run().pipe(
					Effect.tap(() => Console.log(color.success(`Completed ${name}: ${ytChannelId}`)))
				)
			);
			return;
		}

		const ytChannelIds = creators.map((creator) => creator.ytChannelId);
		const { selected, names } = yield* selectOperations({
			operations: {
				creators: () =>
					creatorSync.syncCreators(creators, 'SEED').pipe(mapOperationError('creator sync')),
				videos: () =>
					videoSync
						.syncVideosForCreators(ytChannelIds, {
							taskName: 'SEED',
							maxResults: 15
						})
						.pipe(mapOperationError('video sync')),
				twitchLiveStatus: () =>
					twitchLiveStatusSync
						.refreshTwitchLiveStatus('SEED')
						.pipe(mapOperationError('Twitch live status sync')),
				youtubeLiveStatus: () =>
					videoSync
						.refreshYtLiveStatus(ytChannelIds, 'SEED')
						.pipe(mapOperationError('YouTube live status sync'))
			},
			promptLabel: 'Select content sync operations',
			autoSelect: operations,
			all
		});

		if (selected.length === 0) {
			yield* Console.log(color.warn('No valid selection. Aborting.'));
			return;
		}

		if (!yes) {
			const confirmed = yield* Prompt.confirm({
				message: `Run the following operations: ${names}?`,
				initial: false
			});
			if (!confirmed) {
				yield* Console.log(color.warn('Aborted.'));
				return;
			}
		}

		yield* Console.log(color.action(`Running operations: ${names}`));
		yield* Effect.forEach(selected, ([name, run]) =>
			run().pipe(Effect.tap(() => Console.log(color.success(`Completed ${name}`))))
		);
	})
).pipe(Command.withDescription('Seed tracked creators and videos into the database'));

Command.run(command, { version: 'INTERNAL' }).pipe(
	Effect.provide(Layer.merge(contentSyncLayer, BunServices.layer)),
	BunRuntime.runMain
);
