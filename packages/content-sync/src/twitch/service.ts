import { ApiClient } from "@twurple/api"
import { AppTokenAuthProvider } from "@twurple/auth"
import * as Arr from "effect/Array"
import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"
import * as Schema from "effect/Schema"
import { TwitchError } from "./errors"

const REQUEST_DEADLINE = "30 seconds"

const TwitchStream = Schema.Struct({
	userId: Schema.NonEmptyString
})

const TwitchStreamsPage = Schema.Struct({
	data: Schema.Array(TwitchStream)
})

const decodeTwitchStream = Schema.decodeUnknownEffect(Schema.NullOr(TwitchStream))
const decodeTwitchStreamsPage = Schema.decodeUnknownEffect(TwitchStreamsPage)

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
					catch: () =>
						TwitchError.make({
							reason: "request-failed",
							message: `Failed to get stream for user ${userId}`
						})
				}).pipe(
					Effect.timeoutOrElse({
						duration: REQUEST_DEADLINE,
						orElse: () =>
							Effect.fail(
								TwitchError.make({
									reason: "timeout",
									message: `Timed out getting stream for user ${userId}`
								})
							)
					})
				)
				const projectedResponse = yield* Effect.try({
					try: () => (response === null ? null : { userId: response.userId }),
					catch: () =>
						TwitchError.make({
							reason: "invalid-response",
							message: `Invalid stream response for user ${userId}`
						})
				})
				const stream = yield* decodeTwitchStream(projectedResponse).pipe(
					Effect.mapError(() =>
						TwitchError.make({
							reason: "invalid-response",
							message: `Invalid stream response for user ${userId}`
						})
					)
				)

				return stream !== null
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
							catch: () =>
								TwitchError.make({
									reason: "request-failed",
									message: "Failed to get streams for users"
								})
						}).pipe(
							Effect.timeoutOrElse({
								duration: REQUEST_DEADLINE,
								orElse: () =>
									Effect.fail(
										TwitchError.make({
											reason: "timeout",
											message: "Timed out getting streams for users"
										})
									)
							})
						)
				)
				const pages = yield* Effect.forEach(responses, (response) =>
					Effect.try({
						try: () => ({
							data: response.data.map((stream) => ({ userId: stream.userId }))
						}),
						catch: () =>
							TwitchError.make({
								reason: "invalid-response",
								message: "Invalid streams response for users"
							})
					}).pipe(
						Effect.flatMap(decodeTwitchStreamsPage),
						Effect.mapError(() =>
							TwitchError.make({
								reason: "invalid-response",
								message: "Invalid streams response for users"
							})
						)
					)
				)

				const liveUserIds = new Set(
					pages.flatMap((page) => page.data.map((stream) => stream.userId))
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
