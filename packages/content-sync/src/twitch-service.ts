import { ApiClient } from "@twurple/api"
import { AppTokenAuthProvider } from "@twurple/auth"
import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"

class TwitchError extends Data.TaggedError("TwitchError")<{ message: string; cause?: unknown }> {}

const twitchService = Effect.gen(function* () {
	const clientId = Redacted.value(yield* Config.redacted("TWITCH_CLIENT_ID"))
	const clientSecret = Redacted.value(yield* Config.redacted("TWITCH_CLIENT_SECRET"))

	const authProvider = new AppTokenAuthProvider(clientId, clientSecret)
	const twitch = new ApiClient({ authProvider })

	const isCreatorLive = Effect.fn("isCreatorLive")(function* (userId: string) {
		const response = yield* Effect.tryPromise({
			try: () => twitch.streams.getStreamByUserId(userId),
			catch: (cause) =>
				new TwitchError({
					message: `Failed to get stream for user ${userId}`,
					cause
				})
		})

		return response !== null
	})

	const areCreatorsLive = Effect.fn("areCreatorsLive")(function* (userIds: string[]) {
		if (userIds.length === 0) return new Map<string, boolean>()

		const response = yield* Effect.tryPromise({
			try: () => twitch.streams.getStreams({ userId: userIds, limit: 100 }),
			catch: (cause) =>
				new TwitchError({
					message: "Failed to get streams for users",
					cause
				})
		})

		const liveUserIds = new Set(response.data.map((stream) => stream.userId))

		return new Map(userIds.map((userId) => [userId, liveUserIds.has(userId)]))
	})

	return {
		isCreatorLive,
		areCreatorsLive
	} as const
})

type TwitchServiceShape = Effect.Success<typeof twitchService>

export class TwitchService extends Context.Service<TwitchService, TwitchServiceShape>()(
	"@hc/content-sync/twitch-service/TwitchService",
	{ make: twitchService }
) {
	static readonly layer = Layer.effect(this, this.make)
}
