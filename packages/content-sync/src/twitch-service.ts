import { ApiClient } from "@twurple/api"
import { AppTokenAuthProvider } from "@twurple/auth"
import * as Arr from "effect/Array"
import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"

export class TwitchError extends Data.TaggedError("TwitchError")<{
	message: string
	cause?: unknown
}> {}

const twitchService = Effect.gen(function* () {
	const clientId = Redacted.value(yield* Config.redacted("TWITCH_CLIENT_ID"))
	const clientSecret = Redacted.value(yield* Config.redacted("TWITCH_CLIENT_SECRET"))

	const authProvider = new AppTokenAuthProvider(clientId, clientSecret)
	const twitchApi = new ApiClient({ authProvider })

	const isChannelLive = Effect.fn("TwitchService.isChannelLive")(function* (userId: string) {
		const response = yield* Effect.tryPromise({
			try: () => twitchApi.streams.getStreamByUserId(userId),
			catch: (cause) =>
				new TwitchError({
					message: `Failed to get stream for user ${userId}`,
					cause
				})
		})

		return response !== null
	})

	const getLiveChannels = Effect.fn("TwitchService.getLiveChannels")(function* (userIds: string[]) {
		if (userIds.length === 0) return new Map<string, boolean>()

		const responses = yield* Effect.forEach(Arr.chunksOf(new Set(userIds), 100), (userIdChunk) =>
			Effect.tryPromise({
				try: () => twitchApi.streams.getStreams({ userId: userIdChunk, limit: 100 }),
				catch: (cause) =>
					new TwitchError({
						message: "Failed to get streams for users",
						cause
					})
			})
		)

		const liveUserIds = new Set(
			responses.flatMap((response) => response.data.map((stream) => stream.userId))
		)
		return new Map(userIds.map((userId) => [userId, liveUserIds.has(userId)]))
	})

	return {
		isChannelLive,
		getLiveChannels
	} as const
})

export class TwitchService extends Context.Service<TwitchService>()(
	"@hc/content-sync/twitch-service/TwitchService",
	{ make: twitchService }
) {
	static readonly layer = Layer.effect(this, this.make)
}
