#!/usr/bin/env bun

import { BunRuntime } from '@effect/platform-bun';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import { Command, Flag } from 'effect/unstable/cli';
import { creators } from '../src/creators';
import { CreatorSync } from '../src/creator-sync';
import { TwitchLiveStatusSync } from '../src/twitch-live-status-sync';
import { VideoSync } from '../src/video-sync';
import { provideContentSyncCommand } from './runtime';
import { ScriptError, parseOperations, runOperationSelection, type OperationMap } from './utils';

const mapOperationError = (name: string) =>
	Effect.mapError((cause: unknown) => new ScriptError({ message: `Failed to run ${name}`, cause }));

type CreatorSyncService = Effect.Success<typeof CreatorSync>;
type VideoSyncService = Effect.Success<typeof VideoSync>;
type TwitchLiveStatusSyncService = Effect.Success<typeof TwitchLiveStatusSync>;

const createMultiCreatorVideoOperations = (
	videoSync: VideoSyncService,
	ytChannelIds: string[]
) => ({
	videos: () =>
		videoSync
			.syncVideosForCreators(ytChannelIds, {
				taskName: 'SEED',
				maxResults: 15
			})
			.pipe(mapOperationError('video sync')),
	youtubeLiveStatus: () =>
		videoSync
			.refreshYtLiveStatus(ytChannelIds, 'SEED')
			.pipe(mapOperationError('YouTube live status sync'))
});

const createSingleCreatorOperations = (args: {
	creatorSync: CreatorSyncService;
	videoSync: VideoSyncService;
	creator: (typeof creators)[number];
}) =>
	({
		creator: () =>
			args.creatorSync.syncCreator(args.creator).pipe(mapOperationError('creator sync')),
		videos: () =>
			args.videoSync
				.syncVideosForCreators([args.creator.ytChannelId], {
					taskName: 'SEED',
					maxResults: 15
				})
				.pipe(mapOperationError('video sync')),
		youtubeLiveStatus: () =>
			args.videoSync
				.refreshYtLiveStatus([args.creator.ytChannelId], 'SEED')
				.pipe(mapOperationError('YouTube live status sync'))
	}) satisfies OperationMap<'creator' | 'videos' | 'youtubeLiveStatus', ScriptError>;

const createAllCreatorOperations = (args: {
	creatorSync: CreatorSyncService;
	videoSync: VideoSyncService;
	twitchLiveStatusSync: TwitchLiveStatusSyncService;
}) => {
	const ytChannelIds = creators.map((creator) => creator.ytChannelId);

	return {
		creators: () =>
			args.creatorSync.syncCreators(creators, 'SEED').pipe(mapOperationError('creator sync')),
		...createMultiCreatorVideoOperations(args.videoSync, ytChannelIds),
		twitchLiveStatus: () =>
			args.twitchLiveStatusSync
				.refreshTwitchLiveStatus('SEED')
				.pipe(mapOperationError('Twitch live status sync'))
	} satisfies OperationMap<
		'creators' | 'videos' | 'twitchLiveStatus' | 'youtubeLiveStatus',
		ScriptError
	>;
};

const seedCommand = Command.make(
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

			return yield* runOperationSelection({
				operations: createSingleCreatorOperations({ creatorSync, videoSync, creator }),
				promptLabel: 'Select creator operations',
				autoSelect: operations,
				all,
				yes,
				confirmMessage: (names) => `Run ${names} for creator "${ytChannelId}"?`,
				successMessage: (name) => `Completed ${name}: ${ytChannelId}`
			});
		}

		return yield* runOperationSelection({
			operations: createAllCreatorOperations({ creatorSync, videoSync, twitchLiveStatusSync }),
			promptLabel: 'Select content sync operations',
			autoSelect: operations,
			all,
			yes,
			confirmMessage: (names) => `Run the following operations: ${names}?`,
			successMessage: (name) => `Completed ${name}`
		});
	})
).pipe(Command.withDescription('Seed tracked creators and videos into the database'));

BunRuntime.runMain(provideContentSyncCommand(seedCommand));
