import { ApiClient } from "@twurple/api"
import { AppTokenAuthProvider } from "@twurple/auth"
import * as Arr from "effect/Array"
import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"
import { TwitchError } from "./errors"

export class TwitchService extends Context.Service<
	TwitchService,
	{
		isChannelLive(userId: string): Effect.Effect<boolean, TwitchError>
		areChannelsLive(userIds: string[]): Effect.Effect<Map<string, boolean>, TwitchError>
	}
>()("@hc/content-sync/twitch/service/TwitchService") {
	static readonly layer = Layer.effect(
		TwitchService,
		Effect.gen(function* () {
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

			const areChannelsLive = Effect.fn("TwitchService.areChannelsLive")(function* (
				userIds: string[]
			) {
				if (userIds.length === 0) return new Map<string, boolean>()

				const responses = yield* Effect.forEach(
					Arr.chunksOf(new Set(userIds), 100),
					(userIdChunk) =>
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

			return TwitchService.of({
				isChannelLive,
				areChannelsLive
			})
		})
	)
}

export type TwitchServiceType = TwitchService["Service"]
