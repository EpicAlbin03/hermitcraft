import type { youtube_v3 as yt_v3 } from "googleapis"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { YtError } from "./errors"

const YtChannelPlaylistItem = Schema.Struct({
	contentDetails: Schema.Struct({
		relatedPlaylists: Schema.Struct({
			uploads: Schema.NonEmptyString
		})
	})
})

const YtPlaylistItem = Schema.Struct({
	contentDetails: Schema.Struct({
		videoId: Schema.NonEmptyString
	})
})

const YtPlaylistItemId = Schema.Struct({
	id: Schema.NonEmptyString
})

const decodeYtChannelPlaylistItem = Schema.decodeUnknownEffect(YtChannelPlaylistItem)
const decodeYtPlaylistItems = Schema.decodeUnknownEffect(Schema.Array(YtPlaylistItem))
const decodeYtPlaylistItemIds = Schema.decodeUnknownEffect(Schema.Array(YtPlaylistItemId))

const RSS_VIDEOS_COUNT = 15
const YOUTUBE_MAX_PAGE_SIZE = 50

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

function getYtPlaylistId(ytChannelId: string, type: YtPlaylistType) {
	if (!ytChannelId.startsWith("UC")) {
		return Effect.fail(new YtError({ message: `Invalid YouTube channel ID: ${ytChannelId}` }))
	}
	return Effect.succeed(`${ytPlaylistPrefixes[type]}${ytChannelId.slice(2)}`)
}

export const makePlaylistMethods = (ytApi: yt_v3.Youtube) => {
	const fetchPlaylistPage = Effect.fn("YtService.fetchPlaylistPage")(function* (options: {
		playlistId: string
		part: "contentDetails" | "id"
		limit: number
		context: string
		pageToken?: string
		videoId?: string
	}) {
		const response = yield* Effect.tryPromise({
			try: (signal) =>
				ytApi.playlistItems.list(
					{
						part: [options.part],
						playlistId: options.playlistId,
						maxResults: options.limit,
						...(options.pageToken !== undefined ? { pageToken: options.pageToken } : {}),
						...(options.videoId !== undefined ? { videoId: options.videoId } : {})
					},
					{ signal }
				),
			catch: (cause) =>
				new YtError({
					message: `Failed to fetch ${options.context}`,
					cause
				})
		})

		return response.data
	})

	const decodePlaylistVideoIds = Effect.fn("YtService.decodePlaylistVideoIds")(
		(items: unknown, context: string) =>
			decodeYtPlaylistItems(items).pipe(
				Effect.map((items) => items.map((item) => item.contentDetails.videoId)),
				Effect.mapError(
					(cause) =>
						new YtError({
							message: `${context} returned invalid items`,
							cause
						})
				)
			)
	)

	const decodePlaylistItemIds = Effect.fn("YtService.decodePlaylistItemIds")(
		(items: unknown, context: string) =>
			decodeYtPlaylistItemIds(items).pipe(
				Effect.map((items) => items.map((item) => item.id)),
				Effect.mapError(
					(cause) =>
						new YtError({
							message: `${context} returned invalid items`,
							cause
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
		let nextPageToken: string | undefined

		do {
			const remainingResults = limit === undefined ? YOUTUBE_MAX_PAGE_SIZE : limit - videoIds.length
			const page = yield* getPlaylistVideoIdsPage({
				playlistId,
				limit: Math.min(YOUTUBE_MAX_PAGE_SIZE, remainingResults),
				context,
				...(nextPageToken !== undefined ? { pageToken: nextPageToken } : {})
			})
			videoIds.push(...page.videoIds)
			nextPageToken = page.nextPageToken
		} while (nextPageToken && (limit === undefined || videoIds.length < limit))

		return limit === undefined ? videoIds : videoIds.slice(0, limit)
	})

	const getVideoIdsFromUploadsPlaylist = Effect.fn("YtService.getVideoIdsFromUploadsPlaylist")(
		function* (ytChannelId: string, limit?: number) {
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
				catch: (cause) =>
					new YtError({
						message: `Failed to get playlists for channel ${ytChannelId}`,
						cause
					})
			})

			const item = response.data.items?.[0]
			if (!item) {
				return yield* new YtError({
					message: `Could not find uploads playlist for channel ${ytChannelId}`
				})
			}

			const channelPlaylist = yield* decodeYtChannelPlaylistItem(item).pipe(
				Effect.mapError(
					(cause) =>
						new YtError({
							message: `Channel ${ytChannelId} returned invalid playlist details`,
							cause
						})
				)
			)
			const uploadsPlaylistId = channelPlaylist.contentDetails.relatedPlaylists.uploads

			yield* Effect.logInfo("Found uploads playlist", { ytChannelId, uploadsPlaylistId })

			const targetResults = limit === undefined ? undefined : limit + RSS_VIDEOS_COUNT
			const videoIds = yield* getPlaylistVideoIds(
				uploadsPlaylistId,
				`Playlist ${uploadsPlaylistId}`,
				targetResults
			)

			// Remove the videos handled by the RSS sync to avoid processing them twice.
			// Backfill callers should include this offset in the areVideosShorts limit.
			return videoIds.slice(RSS_VIDEOS_COUNT, targetResults)
		}
	)

	const isVideoShort = Effect.fn("YtService.isVideoShort")(function* (
		ytVideoId: string,
		ytChannelId: string
	) {
		const shortsPlaylistId = yield* getYtPlaylistId(ytChannelId, "shorts")
		const context = `Shorts playlist for ${ytChannelId}`
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
		limit: number = YOUTUBE_MAX_PAGE_SIZE
	) {
		const shortsPlaylistId = yield* getYtPlaylistId(ytChannelId, "shorts")
		const uniqueVideoIds = [...new Set(ytVideoIds)]
		if (uniqueVideoIds.length === 0) return new Map<string, boolean>()
		if (limit < 1 || limit > YOUTUBE_MAX_PAGE_SIZE) {
			return yield* new YtError({
				message: `Limit must be between 1 and ${YOUTUBE_MAX_PAGE_SIZE}`
			})
		}

		const videoIds = yield* getPlaylistVideoIds(
			shortsPlaylistId,
			`Shorts playlist for ${ytChannelId}`,
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
		if (limit === 0) return []
		if (limit < 1 || limit > YOUTUBE_MAX_PAGE_SIZE) {
			return yield* new YtError({
				message: `Limit must be between 1 and ${YOUTUBE_MAX_PAGE_SIZE}`
			})
		}

		return yield* getPlaylistVideoIds(
			livestreamsPlaylistId,
			`Livestreams playlist for ${ytChannelId}`,
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
