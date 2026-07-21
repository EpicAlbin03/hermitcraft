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
import { CountFromString, getThumbnailUrl } from "./shared"

export type VideoDetails = Omit<Video, "isShort">

const YtVideoItem = Schema.Struct({
	id: Schema.NonEmptyString,
	snippet: Schema.Struct({
		channelId: Schema.NonEmptyString,
		title: Schema.NonEmptyString,
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

const decodeYtVideoItem = Schema.decodeUnknownEffect(YtVideoItem)

export function parseIsoDurationToSeconds(duration: string) {
	return Effect.try({
		try: () => Temporal.Duration.from(duration).total("seconds"),
		catch: (cause) => new YtError({ message: `Invalid ISO duration: ${duration}`, cause })
	})
}

export function getVideoLivestreamType(
	liveBroadcastContent: LiveBroadcastContent,
	hasBeenLivestream: boolean
) {
	if (liveBroadcastContent !== "none") return liveBroadcastContent
	return hasBeenLivestream ? "completed" : "none"
}

export const makeVideoMethods = (ytApi: yt_v3.Youtube) => {
	const fetchVideos = Effect.fn("YtService.fetchVideos")((ytVideoIds: string[]) =>
		Effect.tryPromise({
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
					message: `Failed to get video details for ${ytVideoIds.join(", ")}`,
					cause
				})
		}).pipe(Effect.map((response) => response.data.items ?? []))
	)

	const parseVideoDetails = Effect.fn("YtService.parseVideoDetails")(function* (
		item: yt_v3.Schema$Video,
		ytVideoId: string
	) {
		const video = yield* decodeYtVideoItem(item).pipe(
			Effect.mapError(
				(cause) =>
					new YtError({
						message: `Video ${ytVideoId} returned invalid details`,
						cause
					})
			)
		)

		const { snippet, status, statistics, contentDetails, liveStreamingDetails } = video
		const duration = contentDetails.duration

		return {
			ytVideoId: video.id,
			ytChannelId: snippet.channelId,
			title: snippet.title,
			thumbnailUrl: getThumbnailUrl(item),
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

	const getVideoDetails = Effect.fn("YtService.getVideoDetails")(function* (ytVideoId: string) {
		const [item] = yield* fetchVideos([ytVideoId])
		if (!item) return yield* new YtError({ message: `Video ${ytVideoId} not found` })
		return yield* parseVideoDetails(item, ytVideoId)
	})

	const getBatchVideoDetails = Effect.fn("YtService.getBatchVideoDetails")(function* (
		ytVideoIds: string[]
	) {
		if (ytVideoIds.length === 0) return new Map<string, VideoDetails>()
		if (ytVideoIds.length > 50) {
			return yield* new YtError({ message: "Maximum of 50 videos can be fetched at once" })
		}

		const items = yield* fetchVideos(ytVideoIds)
		const videos = yield* Effect.forEach(items, (item) =>
			parseVideoDetails(item, item.id ?? "unknown")
		)
		const videosById = new Map(videos.map((video) => [video.ytVideoId, video]))
		const missingVideoIds = ytVideoIds.filter((videoId) => !videosById.has(videoId))

		if (missingVideoIds.length > 0) {
			return yield* new YtError({
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
