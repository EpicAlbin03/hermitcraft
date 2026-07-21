import { youtube_v3 as yt_v3 } from "googleapis"
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

export function getYtPlaylistId(ytChannelId: string, type: YtPlaylistType) {
	if (!ytChannelId.startsWith("UC")) return null
	return `${ytPlaylistPrefixes[type]}${ytChannelId.slice(2)}`
}

export const makePlaylistMethods = (ytApi: yt_v3.Youtube) => {
	const getVideoIdsFromUploadsPlaylist = Effect.fn("YtService.getVideoIdsFromUploadsPlaylist")(
		function* (ytChannelId: string, maxResults?: number) {
			const playlists = yield* Effect.tryPromise({
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

			const item = playlists.data.items?.[0]
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

			yield* Effect.logInfo(`Uploads playlist ID: ${uploadsPlaylistId}`)

			const videoIds: string[] = []
			const targetResults = maxResults === undefined ? undefined : maxResults + 15
			let nextPageToken: string | undefined

			do {
				const playlistResponse = yield* Effect.tryPromise({
					try: (signal) =>
						ytApi.playlistItems.list(
							{
								part: ["contentDetails"],
								playlistId: uploadsPlaylistId,
								maxResults: 50,
								...(nextPageToken !== undefined ? { pageToken: nextPageToken } : {})
							},
							{ signal }
						),
					catch: (cause) =>
						new YtError({
							message: `Failed to get playlist items for playlist ${uploadsPlaylistId}`,
							cause
						})
				})

				const items = yield* decodeYtPlaylistItems(playlistResponse.data.items || []).pipe(
					Effect.mapError(
						(cause) =>
							new YtError({
								message: `Playlist ${uploadsPlaylistId} returned invalid items`,
								cause
							})
					)
				)
				videoIds.push(...items.map((item) => item.contentDetails.videoId))
				nextPageToken = playlistResponse.data.nextPageToken || undefined
			} while (nextPageToken && (targetResults === undefined || videoIds.length < targetResults))

			// Remove first 15 videos to not conflict with RSS feed / videoSyncProgram
			return videoIds.slice(15, targetResults)
		}
	)

	const isVideoShort = Effect.fn("YtService.isVideoShort")(function* (
		ytVideoId: string,
		ytChannelId: string
	) {
		const shortsPlaylistId = getYtPlaylistId(ytChannelId, "shorts")
		if (!shortsPlaylistId) return false

		const response = yield* Effect.tryPromise({
			try: (signal) =>
				ytApi.playlistItems.list(
					{
						part: ["id"],
						playlistId: shortsPlaylistId,
						videoId: ytVideoId,
						maxResults: 1
					},
					{ signal }
				),
			catch: (cause) =>
				new YtError({
					message: `Failed to check if video ${ytVideoId} is a short`,
					cause
				})
		})

		const items = yield* decodeYtPlaylistItemIds(response.data.items || []).pipe(
			Effect.mapError(
				(cause) =>
					new YtError({
						message: `Shorts playlist for ${ytChannelId} returned invalid items`,
						cause
					})
			)
		)

		return items.length > 0
	})

	const areVideosShorts = Effect.fn("YtService.areVideosShorts")(function* (
		ytVideoIds: string[],
		ytChannelId: string,
		maxResults?: number
	) {
		if (ytVideoIds.length === 0) return new Map<string, boolean>()

		const shortsPlaylistId = getYtPlaylistId(ytChannelId, "shorts")
		if (!shortsPlaylistId) {
			return new Map(ytVideoIds.map((videoId) => [videoId, false]))
		}

		const shortsSet = new Set<string>()
		let nextPageToken: string | undefined

		do {
			const playlistResponse = yield* Effect.tryPromise({
				try: (signal) =>
					ytApi.playlistItems.list(
						{
							part: ["contentDetails"],
							playlistId: shortsPlaylistId,
							maxResults: 50,
							...(nextPageToken !== undefined ? { pageToken: nextPageToken } : {})
						},
						{ signal }
					),
				catch: (cause) =>
					new YtError({
						message: `Failed to fetch shorts playlist for ${ytChannelId}`,
						cause
					})
			})

			const items = yield* decodeYtPlaylistItems(playlistResponse.data.items || []).pipe(
				Effect.mapError(
					(cause) =>
						new YtError({
							message: `Shorts playlist for ${ytChannelId} returned invalid items`,
							cause
						})
				)
			)
			for (const item of items) shortsSet.add(item.contentDetails.videoId)
			nextPageToken = playlistResponse.data.nextPageToken || undefined
		} while (nextPageToken && (maxResults === undefined || shortsSet.size < maxResults))

		return new Map(ytVideoIds.map((videoId) => [videoId, shortsSet.has(videoId)]))
	})

	const getLiveStreamVideoIds = Effect.fn("YtService.getLiveStreamVideoIds")(function* (
		ytChannelId: string,
		maxResults: number = 10
	) {
		const livestreamsPlaylistId = getYtPlaylistId(ytChannelId, "livestreams")
		if (!livestreamsPlaylistId) return []

		const response = yield* Effect.tryPromise({
			try: (signal) =>
				ytApi.playlistItems.list(
					{
						part: ["contentDetails"],
						playlistId: livestreamsPlaylistId,
						maxResults
					},
					{ signal }
				),
			catch: (cause) =>
				new YtError({
					message: `Failed to fetch livestreams playlist for ${ytChannelId}`,
					cause
				})
		})

		const items = yield* decodeYtPlaylistItems(response.data.items || []).pipe(
			Effect.mapError(
				(cause) =>
					new YtError({
						message: `Livestreams playlist for ${ytChannelId} returned invalid items`,
						cause
					})
			)
		)

		return items.map((item) => item.contentDetails.videoId)
	})

	return {
		getVideoIdsFromUploadsPlaylist,
		isVideoShort,
		areVideosShorts,
		getLiveStreamVideoIds
	}
}
