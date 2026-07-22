import type { youtube_v3 as yt_v3 } from "googleapis"
import * as Effect from "effect/Effect"
import { REQUEST_DEADLINE, YT_MAX_PAGE_SIZE } from "../../constants"
import { YtError } from "../errors"
import { parseVideoDetails, type VideoDetails } from "./utils"
import { decodeYtVideoResponse } from "./schemas"

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
		if (ytVideoIds.length > YT_MAX_PAGE_SIZE) {
			return yield* YtError.make({
				reason: "invalid-input",
				message: `Maximum of ${YT_MAX_PAGE_SIZE} videos can be fetched at once`
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
