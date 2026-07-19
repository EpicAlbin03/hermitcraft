import type { Video } from "@hc/db/schema"
import { Temporal } from "@js-temporal/polyfill"
import { youtube_v3 as yt_v3 } from "googleapis"
import * as Effect from "effect/Effect"
import { YtError } from "./errors"
import { getThumbnailUrl, parseDate } from "./shared"

export type VideoDetails = Omit<Video, "isShort">

const parsePrivacyStatus = (value: string | null | undefined) => {
	switch (value) {
		case "private":
		case "public":
		case "unlisted":
			return value
		default:
			return "public"
	}
}

const parseUploadStatus = (value: string | null | undefined) => {
	switch (value) {
		case "deleted":
		case "failed":
		case "processed":
		case "rejected":
		case "uploaded":
			return value
		default:
			return "uploaded"
	}
}

const parseLiveBroadcastContent = (value: string | null | undefined) => {
	switch (value) {
		case "live":
		case "upcoming":
			return value
		default:
			return "none"
	}
}

export function parseIsoDurationToSeconds(duration: string) {
	return Temporal.Duration.from(duration).total("seconds")
}

export function getVideoLivestreamType(
	liveBroadcastContent: "live" | "none" | "upcoming",
	hasBeenLivestream: boolean
) {
	if (liveBroadcastContent !== "none") return liveBroadcastContent
	return hasBeenLivestream ? "completed" : "none"
}

export const makeVideoMethods = (ytApi: yt_v3.Youtube) => {
	const parseVideoDetails = Effect.fn("YtService.parseVideoDetails")(function* (
		item: yt_v3.Schema$Video | undefined,
		ytVideoId: string
	) {
		if (!item || !item.id || !item.snippet || !item.snippet.channelId) {
			return yield* new YtError({ message: `Video ${ytVideoId} not found` })
		}

		const hasBeenLivestream = item.liveStreamingDetails !== undefined
		const liveBroadcastContent = parseLiveBroadcastContent(item.snippet.liveBroadcastContent)

		return {
			ytVideoId: item.id,
			ytChannelId: item.snippet.channelId,
			title: item.snippet.title || "",
			thumbnailUrl: getThumbnailUrl(item),
			publishedAt: parseDate(item.snippet.publishedAt),
			privacyStatus: parsePrivacyStatus(item.status?.privacyStatus),
			uploadStatus: parseUploadStatus(item.status?.uploadStatus),
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

	return {
		getVideoDetails,
		getBatchVideoDetails
	}
}
