import type { ApiClient } from "@twurple/api"
import * as Arr from "effect/Array"
import * as Effect from "effect/Effect"
import { REQUEST_DEADLINE, TWITCH_MAX_PAGE_SIZE } from "../constants"
import { TwitchError } from "./errors"
import { decodeTwitchStream, decodeTwitchStreamsPage } from "./schemas"

export const makeStreamMethods = (twitchApi: ApiClient) => {
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

	const areChannelsLive = Effect.fn("TwitchService.areChannelsLive")(function* (userIds: string[]) {
		if (userIds.length === 0) return new Map<string, boolean>()

		const responses = yield* Effect.forEach(
			Arr.chunksOf(new Set(userIds), TWITCH_MAX_PAGE_SIZE),
			(userIdChunk) =>
				Effect.tryPromise({
					try: () =>
						twitchApi.streams.getStreams({
							userId: userIdChunk,
							limit: TWITCH_MAX_PAGE_SIZE
						}),
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

		const liveUserIds = new Set(pages.flatMap((page) => page.data.map((stream) => stream.userId)))
		return new Map(userIds.map((userId) => [userId, liveUserIds.has(userId)]))
	})

	return { isChannelLive, areChannelsLive }
}
