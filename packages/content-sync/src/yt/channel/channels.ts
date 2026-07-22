import type { Creator } from "@hc/db/schema"
import type { youtube_v3 as yt_v3 } from "googleapis"
import * as Effect from "effect/Effect"
import * as HttpClient from "effect/unstable/http/HttpClient"
import { REQUEST_DEADLINE } from "../../constants"
import { YtError } from "../errors"
import { getThumbnailUrl } from "../shared"
import { makeBannerMethods } from "./banner"
import { decodeYtChannelResponse } from "./schemas"

export type ChannelDetails = Pick<Creator, Extract<keyof Creator, `yt${string}`>>

export const makeChannelMethods = (ytApi: yt_v3.Youtube, httpClient: HttpClient.HttpClient) => {
	const { generateBannerThumbHash } = makeBannerMethods(httpClient)

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
			catch: () =>
				YtError.make({
					reason: "request-failed",
					message: `Failed to get details for channel ${ytChannelId}`
				})
		}).pipe(
			Effect.timeoutOrElse({
				duration: REQUEST_DEADLINE,
				orElse: () =>
					Effect.fail(
						YtError.make({
							reason: "timeout",
							message: `Timed out getting details for channel ${ytChannelId}`
						})
					)
			})
		)

		const data = yield* decodeYtChannelResponse(response.data).pipe(
			Effect.mapError(() =>
				YtError.make({
					reason: "invalid-response",
					message: `Channel ${ytChannelId} returned invalid details`
				})
			)
		)
		const channel = data.items?.[0]
		if (!channel) {
			return yield* YtError.make({
				reason: "not-found",
				message: `Channel ${ytChannelId} not found`
			})
		}

		const { snippet, statistics, brandingSettings } = channel

		const bannerUrl = brandingSettings?.image?.bannerExternalUrl ?? ""
		const ytBannerThumbHash = bannerUrl
			? yield* generateBannerThumbHash(bannerUrl).pipe(
					Effect.catchTag("YtError", (error) =>
						Effect.logWarning("Failed to generate banner ThumbHash", {
							ytChannelId,
							reason: error.reason
						}).pipe(Effect.as(null))
					)
				)
			: null

		return {
			ytChannelId: channel.id,
			ytName: snippet.title,
			ytHandle: snippet.customUrl ?? "",
			ytDescription: snippet.description ?? "",
			ytAvatarUrl: getThumbnailUrl(snippet.thumbnails),
			ytBannerUrl: bannerUrl,
			ytBannerThumbHash,
			ytViewCount: statistics.viewCount,
			ytSubscriberCount: statistics.subscriberCount ?? 0,
			ytHiddenSubscriberCount: statistics.hiddenSubscriberCount ?? false,
			ytVideoCount: statistics.videoCount,
			ytJoinedAt: snippet.publishedAt
		} satisfies ChannelDetails
	})

	return { getChannelDetails }
}
