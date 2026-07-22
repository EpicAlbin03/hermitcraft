import type { LiveBroadcastContent, Video } from "@hc/db/schema"
import { Temporal } from "@js-temporal/polyfill"
import * as Effect from "effect/Effect"
import { YtError } from "../errors"
import { getThumbnailUrl } from "../shared"
import type { YtVideo } from "./schemas"

export type VideoDetails = Omit<Video, "isShort">

const parseIsoDurationToSeconds = Effect.fn("YtService.parseIsoDurationToSeconds")(function* (
	duration: string
) {
	return yield* Effect.try({
		try: () => Temporal.Duration.from(duration).total("seconds"),
		catch: () =>
			YtError.make({
				reason: "invalid-response",
				message: `Invalid ISO duration: ${duration}`
			})
	})
})

function getVideoLivestreamType(
	liveBroadcastContent: LiveBroadcastContent,
	hasLiveStreamingDetails: boolean
) {
	if (liveBroadcastContent !== "none") return liveBroadcastContent
	return hasLiveStreamingDetails ? "completed" : "none"
}

export const parseVideoDetails = Effect.fn("YtService.parseVideoDetails")(function* (
	video: YtVideo
) {
	const { snippet, status, statistics, contentDetails, liveStreamingDetails } = video
	const duration = contentDetails.duration

	return {
		ytVideoId: video.id,
		ytChannelId: snippet.channelId,
		title: snippet.title,
		thumbnailUrl: getThumbnailUrl(snippet.thumbnails),
		publishedAt: snippet.publishedAt,
		privacyStatus: status.privacyStatus,
		uploadStatus: status.uploadStatus,
		viewCount: statistics.viewCount ?? 0,
		likeCount: statistics.likeCount ?? 0,
		commentCount: statistics.commentCount ?? 0,
		durationSeconds: duration ? yield* parseIsoDurationToSeconds(duration) : null,
		livestreamType: getVideoLivestreamType(
			snippet.liveBroadcastContent,
			liveStreamingDetails !== undefined
		),
		livestreamScheduledStartTime: liveStreamingDetails?.scheduledStartTime ?? null,
		livestreamActualStartTime: liveStreamingDetails?.actualStartTime ?? null,
		livestreamConcurrentViewers: liveStreamingDetails?.concurrentViewers ?? null
	} satisfies VideoDetails
})
