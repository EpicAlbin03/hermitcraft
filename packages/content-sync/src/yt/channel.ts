import type { Creator } from "@hc/db/schema"
import { youtube_v3 as yt_v3 } from "googleapis"
import sharp from "sharp"
import * as Effect from "effect/Effect"
import * as Encoding from "effect/Encoding"
import * as Schema from "effect/Schema"
import * as HttpClient from "effect/unstable/http/HttpClient"
import { rgbaToThumbHash } from "thumbhash"
import { REQUEST_DEADLINE } from "../constants"
import { YtError } from "./errors"
import { CountFromString, getThumbnailUrl, YtItemsResponse, YtThumbnails } from "./shared"

export type ChannelDetails = Pick<Creator, Extract<keyof Creator, `yt${string}`>>

const YtChannelItem = Schema.Struct({
	id: Schema.NonEmptyString,
	snippet: Schema.Struct({
		title: Schema.NonEmptyString,
		customUrl: Schema.optionalKey(Schema.NullOr(Schema.NonEmptyString)),
		description: Schema.optionalKey(Schema.NullOr(Schema.String)),
		publishedAt: Schema.DateFromString,
		thumbnails: Schema.optionalKey(Schema.NullOr(YtThumbnails))
	}),
	statistics: Schema.Struct({
		viewCount: CountFromString,
		subscriberCount: Schema.optionalKey(Schema.NullOr(CountFromString)),
		videoCount: CountFromString,
		hiddenSubscriberCount: Schema.optionalKey(Schema.NullOr(Schema.Boolean))
	}),
	brandingSettings: Schema.optionalKey(
		Schema.Struct({
			image: Schema.optionalKey(
				Schema.Struct({
					bannerExternalUrl: Schema.optionalKey(Schema.NullOr(Schema.String))
				})
			)
		})
	)
})

const YtChannelResponse = YtItemsResponse(YtChannelItem)

const decodeYtChannelResponse = Schema.decodeUnknownEffect(YtChannelResponse)

export const makeChannelMethods = (ytApi: yt_v3.Youtube, httpClient: HttpClient.HttpClient) => {
	const generateBannerThumbHash = Effect.fn("YtService.generateBannerThumbHash")(function* (
		bannerUrl: string
	) {
		const buffer = yield* httpClient.get(`${bannerUrl}=w100`).pipe(
			Effect.flatMap((response) => response.arrayBuffer),
			Effect.mapError(() =>
				YtError.make({
					reason: "request-failed",
					message: "Failed to fetch banner for thumbhash"
				})
			),
			Effect.timeoutOrElse({
				duration: REQUEST_DEADLINE,
				orElse: () =>
					Effect.fail(
						YtError.make({
							reason: "timeout",
							message: "Timed out fetching banner for thumbhash"
						})
					)
			})
		)
		const { data, info } = yield* Effect.tryPromise({
			try: () =>
				sharp(new Uint8Array(buffer))
					.resize({ width: 100, height: 100, fit: "inside", withoutEnlargement: true })
					.ensureAlpha()
					.raw()
					.toBuffer({ resolveWithObject: true }),
			catch: () =>
				YtError.make({ reason: "processing-failed", message: "Failed to decode banner image" })
		})
		const hash = yield* Effect.try({
			try: () => rgbaToThumbHash(info.width, info.height, data),
			catch: () =>
				YtError.make({
					reason: "processing-failed",
					message: "Failed to generate banner ThumbHash"
				})
		})
		return Encoding.encodeBase64(hash)
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
