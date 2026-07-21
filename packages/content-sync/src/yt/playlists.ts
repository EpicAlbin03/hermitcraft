import type { youtube_v3 as yt_v3 } from "googleapis"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import {
	REQUEST_DEADLINE,
	YT_MAX_PAGE_SIZE,
	YT_MAX_UPLOADS_LIMIT,
	YT_RSS_VIDEOS_COUNT
} from "../constants"
import { YtError } from "./errors"
import { validateIntegerInRange, YtItemsResponse, YtPaginatedItemsResponse } from "./shared"

const YtChannelPlaylistItem = Schema.Struct({
	contentDetails: Schema.Struct({
		relatedPlaylists: Schema.Struct({
			uploads: Schema.NonEmptyString
		})
	})
})

const YtChannelPlaylistResponse = YtItemsResponse(YtChannelPlaylistItem)

const YtPlaylistItem = Schema.Struct({
	contentDetails: Schema.Struct({
		videoId: Schema.NonEmptyString
	})
})

const YtPlaylistItemId = Schema.Struct({
	id: Schema.NonEmptyString
})

const YtPlaylistPage = YtPaginatedItemsResponse(Schema.Unknown)

const decodeYtChannelPlaylistResponse = Schema.decodeUnknownEffect(YtChannelPlaylistResponse)
const decodeYtPlaylistPage = Schema.decodeUnknownEffect(YtPlaylistPage)
const decodeYtPlaylistItems = Schema.decodeUnknownEffect(Schema.Array(YtPlaylistItem))
const decodeYtPlaylistItemIds = Schema.decodeUnknownEffect(Schema.Array(YtPlaylistItemId))

// YouTube does not officially document these derived playlist ID prefixes.
const ytPlaylistPrefixes = {
	videos: "UULF", // Doesn't include shorts and livestreams
	popularVideos: "UULP",
	livestreams: "UULV",
	membersOnlyVideos: "UUMF",
	membersOnlyContents: "UUMO",
	membersOnlyShorts: "UUMS",
	membersOnlyLivestreams: "UUMV",
	popularShorts: "UUPS",
	popularLivestreams: "UUPV",
	shorts: "UUSH"
} as const

type YtPlaylistType = keyof typeof ytPlaylistPrefixes

const validateYtChannelId = Effect.fn("YtService.validateYtChannelId")(function* (
	ytChannelId: string
) {
	if (!ytChannelId.startsWith("UC")) {
		return yield* YtError.make({
			reason: "invalid-input",
			message: `Invalid YouTube channel ID: ${ytChannelId}`
		})
	}
	return ytChannelId
})

const getYtPlaylistId = Effect.fn("YtService.getYtPlaylistId")(function* (
	ytChannelId: string,
	type: YtPlaylistType
) {
	const channelId = yield* validateYtChannelId(ytChannelId)
	return `${ytPlaylistPrefixes[type]}${channelId.slice(2)}`
})

export const makePlaylistMethods = (ytApi: yt_v3.Youtube) => {
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

	const getVideoIdsFromUploadsPlaylist = Effect.fn("YtService.getVideoIdsFromUploadsPlaylist")(
		function* (ytChannelId: string, limit?: number) {
			yield* validateYtChannelId(ytChannelId)
			if (limit !== undefined) {
				yield* validateIntegerInRange(limit, {
					name: "Limit",
					minimum: 0,
					maximum: YT_MAX_UPLOADS_LIMIT
				})
			}
			if (limit === 0) return []

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
			const videoIds = yield* getPlaylistVideoIds(
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
		const data = yield* fetchPlaylistPage({
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

		const videoIds = yield* getPlaylistVideoIds(
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
			minimum: 0,
			maximum: YT_MAX_PAGE_SIZE
		})
		if (limit === 0) return []

		return yield* getPlaylistVideoIds(
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
