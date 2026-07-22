import type { youtube_v3 as yt_v3 } from "googleapis"
import * as Effect from "effect/Effect"
import {
	REQUEST_DEADLINE,
	YT_MAX_PAGE_SIZE,
	YT_MAX_UPLOADS_LIMIT,
	YT_RSS_VIDEOS_COUNT
} from "../../constants"
import { YtError } from "../errors"
import { validateIntegerInRange } from "../shared"
import { makePlaylistClient } from "./client"
import { decodeYtChannelPlaylistResponse, decodeYtPlaylistItemIds } from "./schemas"
import { getYtPlaylistId, validateYtChannelId } from "./utils"

export const makePlaylistMethods = (ytApi: yt_v3.Youtube) => {
	const client = makePlaylistClient(ytApi)

	const decodePlaylistItemIds = Effect.fn("YtService.decodePlaylistItemIds")(
		(items: unknown, context: string) =>
			decodeYtPlaylistItemIds(items).pipe(
				Effect.map((items) => items.map((item) => item.id)),
				Effect.mapError(() =>
					YtError.make({
						reason: "invalid-response",
						message: `Invalid items returned by ${context}`
					})
				)
			)
	)

	const getVideoIdsFromUploadsPlaylist = Effect.fn("YtService.getVideoIdsFromUploadsPlaylist")(
		function* (ytChannelId: string, limit?: number) {
			yield* validateYtChannelId(ytChannelId)
			if (limit !== undefined) {
				yield* validateIntegerInRange(limit, {
					name: "Limit",
					minimum: 1,
					maximum: YT_MAX_UPLOADS_LIMIT
				})
			}

			const response = yield* Effect.tryPromise({
				try: (signal) =>
					ytApi.channels.list(
						{
							part: ["contentDetails"],
							id: [ytChannelId]
						},
						{ signal }
					),
				catch: () =>
					YtError.make({
						reason: "request-failed",
						message: `Failed to get playlists for channel ${ytChannelId}`
					})
			}).pipe(
				Effect.timeoutOrElse({
					duration: REQUEST_DEADLINE,
					orElse: () =>
						Effect.fail(
							YtError.make({
								reason: "timeout",
								message: `Timed out getting playlists for channel ${ytChannelId}`
							})
						)
				})
			)

			const data = yield* decodeYtChannelPlaylistResponse(response.data).pipe(
				Effect.mapError(() =>
					YtError.make({
						reason: "invalid-response",
						message: `Channel ${ytChannelId} returned invalid playlist details`
					})
				)
			)
			const channelPlaylist = data.items?.[0]
			if (!channelPlaylist) {
				return yield* YtError.make({
					reason: "not-found",
					message: `Could not find uploads playlist for channel ${ytChannelId}`
				})
			}
			const uploadsPlaylistId = channelPlaylist.contentDetails.relatedPlaylists.uploads

			yield* Effect.logInfo("Found uploads playlist", { ytChannelId, uploadsPlaylistId })

			const targetResults = limit === undefined ? undefined : limit + YT_RSS_VIDEOS_COUNT
			const videoIds = yield* client.getPlaylistVideoIds(
				uploadsPlaylistId,
				`playlist ${uploadsPlaylistId}`,
				targetResults
			)

			// Remove the videos handled by the RSS sync to avoid processing them twice.
			// Backfill callers should include this offset in the areVideosShorts limit.
			return videoIds.slice(YT_RSS_VIDEOS_COUNT, targetResults)
		}
	)

	const isVideoShort = Effect.fn("YtService.isVideoShort")(function* (
		ytVideoId: string,
		ytChannelId: string
	) {
		const shortsPlaylistId = yield* getYtPlaylistId(ytChannelId, "shorts")
		const context = `shorts playlist for channel ${ytChannelId} while checking video ${ytVideoId}`
		const data = yield* client.fetchPlaylistPage({
			playlistId: shortsPlaylistId,
			part: "id",
			limit: 1,
			context,
			videoId: ytVideoId
		})
		const itemIds = yield* decodePlaylistItemIds(data.items ?? [], context)

		return itemIds.length > 0
	})

	const areVideosShorts = Effect.fn("YtService.areVideosShorts")(function* (
		ytVideoIds: string[],
		ytChannelId: string,
		limit: number = YT_MAX_PAGE_SIZE
	) {
		const shortsPlaylistId = yield* getYtPlaylistId(ytChannelId, "shorts")
		yield* validateIntegerInRange(limit, {
			name: "Limit",
			minimum: 1,
			maximum: YT_MAX_PAGE_SIZE
		})

		const uniqueVideoIds = [...new Set(ytVideoIds)]
		if (uniqueVideoIds.length === 0) return new Map<string, boolean>()

		const videoIds = yield* client.getPlaylistVideoIds(
			shortsPlaylistId,
			`shorts playlist for channel ${ytChannelId}`,
			limit
		)
		const shortsSet = new Set(videoIds)

		return new Map(uniqueVideoIds.map((videoId) => [videoId, shortsSet.has(videoId)]))
	})

	const getLivestreamVideoIds = Effect.fn("YtService.getLivestreamVideoIds")(function* (
		ytChannelId: string,
		limit: number = 10
	) {
		const livestreamsPlaylistId = yield* getYtPlaylistId(ytChannelId, "livestreams")
		yield* validateIntegerInRange(limit, {
			name: "Limit",
			minimum: 1,
			maximum: YT_MAX_PAGE_SIZE
		})

		return yield* client.getPlaylistVideoIds(
			livestreamsPlaylistId,
			`livestreams playlist for channel ${ytChannelId}`,
			limit
		)
	})

	return {
		getVideoIdsFromUploadsPlaylist,
		isVideoShort,
		areVideosShorts,
		getLivestreamVideoIds
	}
}
