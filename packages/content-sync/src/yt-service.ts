import type { Video } from "@hc/db/schema"
import { google, youtube_v3 as yt_v3 } from "googleapis"
import sharp from "sharp"
import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"
import * as Schedule from "effect/Schedule"
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient"
import * as HttpClient from "effect/unstable/http/HttpClient"
import { rgbaToThumbHash, thumbHashToDataURL } from "thumbhash"
import {
	getYtPlaylistId,
	getVideoLivestreamType,
	parseIsoDurationToSeconds,
	parseYtRSS
} from "./utils"

type VideoDetails = Omit<Video, "isShort">
type ChannelDetails = {
	ytChannelId: string
	ytName: string
	ytHandle: string
	ytDescription: string
	ytAvatarUrl: string
	ytBannerUrl: string
	ytBannerThumbHash: string | null
	ytViewCount: number
	ytSubscriberCount: number
	ytVideoCount: number
	ytJoinedAt: Date
}

const parseDate = (value: string | null | undefined) =>
	DateTime.toDate(DateTime.makeUnsafe(value ?? 0))

const getThumbnailUrl = (item: yt_v3.Schema$Video | yt_v3.Schema$Channel) => {
	const thumbnail =
		item.snippet?.thumbnails?.maxres ||
		item.snippet?.thumbnails?.standard ||
		item.snippet?.thumbnails?.high ||
		item.snippet?.thumbnails?.medium ||
		item.snippet?.thumbnails?.default
	return thumbnail?.url || ""
}

export class YtService extends Context.Service<
	YtService,
	{
		getChannelDetails(ytChannelId: string): Effect.Effect<ChannelDetails, YtError>
		getVideoDetails(ytVideoId: string): Effect.Effect<VideoDetails, YtError>
		getBatchVideoDetails(ytVideoIds: string[]): Effect.Effect<Map<string, VideoDetails>, YtError>
		getVideoIdsFromUploadsPlaylist(
			ytChannelId: string,
			maxResults?: number
		): Effect.Effect<string[], YtError>
		getRSSVideoIds(ytChannelId: string): Effect.Effect<string[], YtError>
		isVideoShort(ytVideoId: string, ytChannelId: string): Effect.Effect<boolean, YtError>
		areVideosShorts(
			ytVideoIds: string[],
			ytChannelId: string,
			maxResults?: number
		): Effect.Effect<Map<string, boolean>, YtError>
		getLiveStreamVideoIds(
			ytChannelId: string,
			maxResults?: number
		): Effect.Effect<string[], YtError>
	}
>()("@hc/content-sync/yt-service/YtService") {
	static readonly layer = Layer.effect(
		YtService,
		Effect.gen(function* () {
			const ytApiKey = Redacted.value(yield* Config.redacted("YT_API_KEY"))

			const httpClient = (yield* HttpClient.HttpClient).pipe(HttpClient.filterStatusOk)
			const retryingHttpClient = httpClient.pipe(
				HttpClient.retryTransient({
					schedule: Schedule.exponential("1 second"),
					times: 3
				})
			)

			const ytApi = google.youtube({
				version: "v3",
				auth: ytApiKey
			})

			const generateBannerThumbHash = Effect.fn("YtService.generateBannerThumbHash")(function* (
				bannerUrl: string
			) {
				const buffer = yield* httpClient.get(`${bannerUrl}=w100`).pipe(
					Effect.flatMap((response) => response.arrayBuffer),
					Effect.mapError(
						(cause) => new YtError({ message: "Failed to fetch banner for thumbhash", cause })
					)
				)
				const { data, info } = yield* Effect.tryPromise({
					try: () =>
						sharp(new Uint8Array(buffer)).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
					catch: (cause) => new YtError({ message: "Failed to decode banner image", cause })
				})
				const hash = rgbaToThumbHash(info.width, info.height, data)
				return thumbHashToDataURL(hash)
			})

			const getChannelDetails = Effect.fn("YtService.getChannelDetails")(function* (
				ytChannelId: string
			) {
				const response = yield* Effect.tryPromise({
					try: (signal) =>
						ytApi.channels.list(
							{
								part: ["id", "snippet", "statistics", "brandingSettings"],
								id: [ytChannelId]
							},
							{ signal }
						),
					catch: (cause) =>
						new YtError({
							message: `Failed to get details for channel ${ytChannelId}`,
							cause
						})
				})

				const item = response.data.items?.[0]
				if (!item || !item.id || !item.snippet) {
					return yield* new YtError({ message: `Channel ${ytChannelId} not found` })
				}

				const bannerUrl = item.brandingSettings?.image?.bannerExternalUrl || ""
				const ytBannerThumbHash = bannerUrl
					? yield* generateBannerThumbHash(bannerUrl).pipe(
							Effect.catch((err) =>
								Effect.logWarning(`Failed to generate thumbhash: ${err.message}`).pipe(
									Effect.as(null)
								)
							)
						)
					: null

				return {
					ytChannelId: item.id,
					ytName: item.snippet.title || "",
					ytHandle: item.snippet.customUrl || "",
					ytDescription: item.snippet.description || "",
					ytAvatarUrl: getThumbnailUrl(item),
					ytBannerUrl: bannerUrl,
					ytBannerThumbHash,
					ytViewCount: parseInt(item.statistics?.viewCount || "0", 10),
					ytSubscriberCount: parseInt(item.statistics?.subscriberCount || "0", 10),
					ytVideoCount: parseInt(item.statistics?.videoCount || "0", 10),
					ytJoinedAt: parseDate(item.snippet.publishedAt)
				} satisfies ChannelDetails
			})

			const parseVideoDetails = Effect.fn("YtService.parseVideoDetails")(function* (
				item: yt_v3.Schema$Video | undefined,
				ytVideoId: string
			) {
				if (!item || !item.id || !item.snippet || !item.snippet.channelId) {
					return yield* new YtError({ message: `Video ${ytVideoId} not found` })
				}

				const hasBeenLivestream = item.liveStreamingDetails !== undefined
				const liveBroadcastContent =
					(item.snippet.liveBroadcastContent as Exclude<Video["livestreamType"], "completed">) ||
					"none"

				return {
					ytVideoId: item.id,
					ytChannelId: item.snippet.channelId,
					title: item.snippet.title || "",
					thumbnailUrl: getThumbnailUrl(item),
					publishedAt: parseDate(item.snippet.publishedAt),
					privacyStatus: item.status?.privacyStatus || "public",
					uploadStatus: item.status?.uploadStatus || "uploaded",
					viewCount: parseInt(item.statistics?.viewCount || "0", 10),
					likeCount: parseInt(item.statistics?.likeCount || "0", 10),
					commentCount: parseInt(item.statistics?.commentCount || "0", 10),
					durationSeconds: item.contentDetails?.duration
						? parseIsoDurationToSeconds(item.contentDetails.duration)
						: null,
					livestreamType: getVideoLivestreamType(liveBroadcastContent, hasBeenLivestream),
					livestreamScheduledStartTime: item.liveStreamingDetails?.scheduledStartTime
						? parseDate(item.liveStreamingDetails.scheduledStartTime)
						: null,
					livestreamActualStartTime: item.liveStreamingDetails?.actualStartTime
						? parseDate(item.liveStreamingDetails.actualStartTime)
						: null,
					livestreamConcurrentViewers: item.liveStreamingDetails?.concurrentViewers
						? parseInt(item.liveStreamingDetails.concurrentViewers, 10)
						: null
				} satisfies VideoDetails
			})

			const getVideoDetails = Effect.fn("YtService.getVideoDetails")(function* (ytVideoId: string) {
				const response = yield* Effect.tryPromise({
					try: (signal) =>
						ytApi.videos.list(
							{
								part: ["snippet", "statistics", "contentDetails", "liveStreamingDetails", "status"],
								id: [ytVideoId]
							},
							{ signal }
						),
					catch: (cause) =>
						new YtError({
							message: `Failed to get details for video ${ytVideoId}`,
							cause
						})
				})

				return yield* parseVideoDetails(response.data.items?.[0], ytVideoId)
			})

			const getBatchVideoDetails = Effect.fn("YtService.getBatchVideoDetails")(function* (
				ytVideoIds: string[]
			) {
				if (ytVideoIds.length === 0) return new Map<string, VideoDetails>()
				if (ytVideoIds.length > 50) {
					return yield* new YtError({ message: "Maximum of 50 videos can be fetched at once" })
				}

				const response = yield* Effect.tryPromise({
					try: (signal) =>
						ytApi.videos.list(
							{
								part: ["snippet", "statistics", "contentDetails", "liveStreamingDetails", "status"],
								id: ytVideoIds
							},
							{ signal }
						),
					catch: (cause) =>
						new YtError({
							message: `Failed to get batch video details for ${ytVideoIds}`,
							cause
						})
				})

				const entries = yield* Effect.forEach(response.data.items ?? [], (item) => {
					const videoId = item.id
					if (!videoId) return Effect.succeed(null)

					return parseVideoDetails(item, videoId).pipe(
						Effect.map((videoDetails) => [videoId, videoDetails] as const),
						Effect.catchTag("YtError", (error) =>
							Effect.logWarning(`Failed to parse video ${videoId}: ${error.message}`).pipe(
								Effect.as(null)
							)
						)
					)
				})

				return new Map(entries.filter((entry) => entry !== null))
			})

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

					const uploadsPlaylistId =
						playlists.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads
					if (!uploadsPlaylistId) {
						return yield* new YtError({
							message: `Could not find uploads playlist for channel ${ytChannelId}`
						})
					}

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

						for (const item of playlistResponse.data.items || []) {
							if (item.contentDetails?.videoId) {
								videoIds.push(item.contentDetails.videoId)
							}
						}
						nextPageToken = playlistResponse.data.nextPageToken || undefined
					} while (
						nextPageToken &&
						(targetResults === undefined || videoIds.length < targetResults)
					)

					// Remove first 15 videos to not conflict with RSS feed / videoSyncProgram
					return videoIds.slice(15, targetResults)
				}
			)

			const getRSSVideoIds = Effect.fn("YtService.getRSSVideoIds")(function* (ytChannelId: string) {
				return yield* retryingHttpClient
					.get("https://www.youtube.com/feeds/videos.xml", {
						urlParams: { channel_id: ytChannelId }
					})
					.pipe(
						Effect.flatMap((response) => response.text),
						Effect.map(parseYtRSS),
						Effect.mapError(
							(cause) =>
								new YtError({
									message: `Failed to fetch RSS for channel ${ytChannelId}`,
									cause
								})
						)
					)
			})

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

				return (response.data.items?.length ?? 0) > 0
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

					for (const item of playlistResponse.data.items || []) {
						if (item.contentDetails?.videoId) {
							shortsSet.add(item.contentDetails.videoId)
						}
					}
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

				return (
					response.data.items
						?.map((item) => item.contentDetails?.videoId)
						.filter((videoId) => videoId !== undefined) ?? []
				)
			})

			return YtService.of({
				getChannelDetails,
				getVideoDetails,
				getBatchVideoDetails,
				getVideoIdsFromUploadsPlaylist,
				getRSSVideoIds,
				isVideoShort,
				areVideosShorts,
				getLiveStreamVideoIds
			})
		})
	).pipe(Layer.provide(FetchHttpClient.layer))
}

export type YtServiceType = YtService["Service"]

export class YtError extends Data.TaggedError("YtError")<{
	message: string
	cause?: unknown
}> {}
