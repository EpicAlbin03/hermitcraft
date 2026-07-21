import {
	liveBroadcastContent,
	privacyStatusEnum,
	uploadStatusEnum,
	type LiveBroadcastContent,
	type Video
} from "@hc/db/schema"
import { Temporal } from "@js-temporal/polyfill"
import { youtube_v3 as yt_v3 } from "googleapis"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { YtError } from "./errors"
import { CountFromString, getThumbnailUrl, YtThumbnails } from "./shared"

export type VideoDetails = Omit<Video, "isShort">

const REQUEST_DEADLINE = "30 seconds"

const YtVideoItem = Schema.Struct({
	id: Schema.NonEmptyString,
	snippet: Schema.Struct({
		channelId: Schema.NonEmptyString,
		title: Schema.NonEmptyString,
		thumbnails: Schema.optionalKey(Schema.NullOr(YtThumbnails)),
		publishedAt: Schema.DateFromString,
		liveBroadcastContent: Schema.Literals(liveBroadcastContent)
	}),
	status: Schema.Struct({
		privacyStatus: Schema.Literals(privacyStatusEnum.enumValues),
		uploadStatus: Schema.Literals(uploadStatusEnum.enumValues)
	}),
	statistics: Schema.Struct({
		viewCount: Schema.optionalKey(Schema.NullOr(CountFromString)),
		likeCount: Schema.optionalKey(Schema.NullOr(CountFromString)),
		commentCount: Schema.optionalKey(Schema.NullOr(CountFromString))
	}),
	contentDetails: Schema.Struct({
		duration: Schema.optionalKey(Schema.NullOr(Schema.NonEmptyString))
	}),
	liveStreamingDetails: Schema.optionalKey(
		Schema.Struct({
			scheduledStartTime: Schema.optionalKey(Schema.NullOr(Schema.DateFromString)),
			actualStartTime: Schema.optionalKey(Schema.NullOr(Schema.DateFromString)),
			concurrentViewers: Schema.optionalKey(Schema.NullOr(CountFromString))
		})
	)
})

const YtVideoResponse = Schema.Struct({
	items: Schema.optionalKey(Schema.NullOr(Schema.Array(YtVideoItem)))
})

type YtVideo = typeof YtVideoItem.Type

const decodeYtVideoResponse = Schema.decodeUnknownEffect(YtVideoResponse)

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

const parseVideoDetails = Effect.fn("YtService.parseVideoDetails")(function* (video: YtVideo) {
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

export const makeVideoMethods = (ytApi: yt_v3.Youtube) => {
	const fetchVideos = Effect.fn("YtService.fetchVideos")(function* (ytVideoIds: string[]) {
		const response = yield* Effect.tryPromise({
			try: (signal) =>
				ytApi.videos.list(
					{
						part: ["snippet", "statistics", "contentDetails", "liveStreamingDetails", "status"],
						id: ytVideoIds
					},
					{ signal }
				),
			catch: () =>
				YtError.make({
					reason: "request-failed",
					message: `Failed to get video details for ${ytVideoIds.join(", ")}`
				})
		}).pipe(
			Effect.timeoutOrElse({
				duration: REQUEST_DEADLINE,
				orElse: () =>
					Effect.fail(
						YtError.make({
							reason: "timeout",
							message: `Timed out getting video details for ${ytVideoIds.join(", ")}`
						})
					)
			})
		)

		return yield* decodeYtVideoResponse(response.data).pipe(
			Effect.map((data) => data.items ?? []),
			Effect.mapError(() =>
				YtError.make({
					reason: "invalid-response",
					message: `Invalid video details returned for ${ytVideoIds.join(", ")}`
				})
			)
		)
	})

	const getVideoDetails = Effect.fn("YtService.getVideoDetails")(function* (ytVideoId: string) {
		const [video] = yield* fetchVideos([ytVideoId])
		if (!video) {
			return yield* YtError.make({
				reason: "not-found",
				message: `Video ${ytVideoId} not found`
			})
		}
		return yield* parseVideoDetails(video)
	})

	const getBatchVideoDetails = Effect.fn("YtService.getBatchVideoDetails")(function* (
		ytVideoIds: string[]
	) {
		if (ytVideoIds.length === 0) return new Map<string, VideoDetails>()
		if (ytVideoIds.length > 50) {
			return yield* YtError.make({
				reason: "invalid-input",
				message: "Maximum of 50 videos can be fetched at once"
			})
		}

		const items = yield* fetchVideos(ytVideoIds)
		const videos = yield* Effect.forEach(items, (item) => parseVideoDetails(item))
		const videosById = new Map(videos.map((video) => [video.ytVideoId, video]))
		const missingVideoIds = ytVideoIds.filter((videoId) => !videosById.has(videoId))

		if (missingVideoIds.length > 0) {
			return yield* YtError.make({
				reason: "not-found",
				message: `Videos not found: ${missingVideoIds.join(", ")}`
			})
		}

		return videosById
	})

	return {
		getVideoDetails,
		getBatchVideoDetails
	}
}
