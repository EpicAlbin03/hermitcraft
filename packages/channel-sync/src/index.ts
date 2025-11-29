import { Effect, Console } from 'effect';
import { DbService } from './db';
import { YoutubeService } from './youtube';
import { TaggedError } from 'effect/Data';

class SyncVideoError extends TaggedError('SyncVideoError') {
	constructor(message: string, options?: { cause?: unknown }) {
		super();
		this.message = message;
		this.cause = options?.cause;
	}
}

const channelSyncService = Effect.gen(function* () {
	const db = yield* DbService;
	const youtube = yield* YoutubeService;



	return {
	};
});

export class ChannelSyncService extends Effect.Service<ChannelSyncService>()('ChannelSyncService', {
	dependencies: [
		YoutubeService.Default,
	],
	effect: channelSyncService
}) {}

export * from './db';
