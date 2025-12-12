import { AppTokenAuthProvider } from '@twurple/auth';
import { ApiClient } from '@twurple/api';
import { Effect } from 'effect';
import { TaggedError } from 'effect/Data';

class TwitchError extends TaggedError('TwitchError') {
	constructor(message: string, options?: { cause?: unknown }) {
		super();
		this.message = message;
		this.cause = options?.cause;
	}
}

const twitchService = Effect.gen(function* () {
	const clientId = yield* Effect.sync(() => Bun.env.TWITCH_CLIENT_ID);
	if (!clientId) {
		return yield* Effect.die('TWITCH_CLIENT_ID is not set');
	}

	const clientSecret = yield* Effect.sync(() => Bun.env.TWITCH_CLIENT_SECRET);
	if (!clientSecret) {
		return yield* Effect.die('TWITCH_CLIENT_SECRET is not set');
	}

	const authProvider = new AppTokenAuthProvider(clientId, clientSecret);
	const twitch = new ApiClient({ authProvider });

	const isChannelLive = (userId: string) =>
		Effect.gen(function* () {
			const response = yield* Effect.tryPromise({
				try: () => twitch.streams.getStreamByUserId(userId),
				catch: (err) =>
					new TwitchError(`Failed to get stream for user ${userId}`, {
						cause: err
					})
			});
			return response ? true : false;
		});

	const areChannelsLive = (user_ids: string[]) =>
		Effect.gen(function* () {
			if (user_ids.length === 0) return new Map<string, boolean>();

			const response = yield* Effect.tryPromise({
				try: () => twitch.streams.getStreams({ userId: user_ids, limit: 100 }),
				catch: (err) =>
					new TwitchError(`Failed to get streams for users`, {
						cause: err
					})
			});

			const isLiveMap = new Map<string, boolean>();
			for (const userId of user_ids) {
				isLiveMap.set(
					userId,
					response.data.some((s) => s.userId === userId)
				);
			}

			return isLiveMap;
		});

	return {
		isChannelLive,
		areChannelsLive
	};
});

export class TwitchService extends Effect.Service<TwitchService>()('TwitchService', {
	effect: twitchService
}) {}
