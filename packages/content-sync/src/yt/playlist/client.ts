import type { youtube_v3 as yt_v3 } from "googleapis"
import * as Effect from "effect/Effect"
import { REQUEST_DEADLINE, YT_MAX_PAGE_SIZE } from "../../constants"
import { YtError } from "../errors"
import { validateIntegerInRange } from "../shared"
import { decodeYtPlaylistItems, decodeYtPlaylistPage } from "./schemas"

export const makePlaylistClient = (ytApi: yt_v3.Youtube) => {
	const fetchPlaylistPage = Effect.fn("YtService.fetchPlaylistPage")(function* (options: {
		playlistId: string
		part: "contentDetails" | "id"
		limit: number
		context: string
		pageToken?: string
		videoId?: string
	}) {
		const maxResults = yield* validateIntegerInRange(options.limit, {
			name: "Limit",
			minimum: 1,
			maximum: YT_MAX_PAGE_SIZE
		})
		const response = yield* Effect.tryPromise({
			try: (signal) =>
				ytApi.playlistItems.list(
					{
						part: [options.part],
						playlistId: options.playlistId,
						maxResults,
						...(options.pageToken !== undefined ? { pageToken: options.pageToken } : {}),
						...(options.videoId !== undefined ? { videoId: options.videoId } : {})
					},
					{ signal }
				),
			catch: () =>
				YtError.make({
					reason: "request-failed",
					message: `Failed to fetch ${options.context}`
				})
		}).pipe(
			Effect.timeoutOrElse({
				duration: REQUEST_DEADLINE,
				orElse: () =>
					Effect.fail(
						YtError.make({
							reason: "timeout",
							message: `Timed out fetching ${options.context}`
						})
					)
			})
		)

		return yield* decodeYtPlaylistPage(response.data).pipe(
			Effect.mapError(() =>
				YtError.make({
					reason: "invalid-response",
					message: `Invalid page returned by ${options.context}`
				})
			)
		)
	})

	const decodePlaylistVideoIds = Effect.fn("YtService.decodePlaylistVideoIds")(
		(items: unknown, context: string) =>
			decodeYtPlaylistItems(items).pipe(
				Effect.map((items) => items.map((item) => item.contentDetails.videoId)),
				Effect.mapError(() =>
					YtError.make({
						reason: "invalid-response",
						message: `Invalid items returned by ${context}`
					})
				)
			)
	)

	const getPlaylistVideoIdsPage = Effect.fn("YtService.getPlaylistVideoIdsPage")(
		function* (options: {
			playlistId: string
			limit: number
			context: string
			pageToken?: string
		}) {
			const data = yield* fetchPlaylistPage({
				...options,
				part: "contentDetails"
			})
			const videoIds = yield* decodePlaylistVideoIds(data.items ?? [], options.context)

			return {
				videoIds,
				nextPageToken: data.nextPageToken ?? undefined
			}
		}
	)

	const getPlaylistVideoIds = Effect.fn("YtService.getPlaylistVideoIds")(function* (
		playlistId: string,
		context: string,
		limit?: number
	) {
		const videoIds: string[] = []
		const seenPageTokens = new Set<string>()
		let nextPageToken: string | undefined

		do {
			const remainingResults = limit === undefined ? YT_MAX_PAGE_SIZE : limit - videoIds.length
			const page = yield* getPlaylistVideoIdsPage({
				playlistId,
				limit: Math.min(YT_MAX_PAGE_SIZE, remainingResults),
				context,
				...(nextPageToken !== undefined ? { pageToken: nextPageToken } : {})
			})
			videoIds.push(...page.videoIds)
			nextPageToken = page.nextPageToken
			if (nextPageToken) {
				if (seenPageTokens.has(nextPageToken)) {
					return yield* YtError.make({
						reason: "invalid-response",
						message: `Repeated page token returned by ${context}`
					})
				}
				seenPageTokens.add(nextPageToken)
			}
		} while (nextPageToken && (limit === undefined || videoIds.length < limit))

		return limit === undefined ? videoIds : videoIds.slice(0, limit)
	})

	return { fetchPlaylistPage, getPlaylistVideoIds }
}
