import type { Creator } from "@hc/db/schema"
import { youtube_v3 as yt_v3 } from "googleapis"
import sharp from "sharp"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as HttpClient from "effect/unstable/http/HttpClient"
import { rgbaToThumbHash, thumbHashToDataURL } from "thumbhash"
import { YtError } from "./errors"
import { CountFromString, getThumbnailUrl } from "./shared"

export type ChannelDetails = Pick<Creator, Extract<keyof Creator, `yt${string}`>>

const YtChannelItem = Schema.Struct({
	id: Schema.NonEmptyString,
	snippet: Schema.Struct({
		title: Schema.NonEmptyString,
		customUrl: Schema.optionalKey(Schema.NullOr(Schema.NonEmptyString)),
		description: Schema.optionalKey(Schema.NullOr(Schema.String)),
		publishedAt: Schema.DateFromString
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

const decodeYtChannelItem = Schema.decodeUnknownEffect(YtChannelItem)

export const makeChannelMethods = (ytApi: yt_v3.Youtube, httpClient: HttpClient.HttpClient) => {
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
				sharp(new Uint8Array(buffer))
					.resize({ width: 100, height: 100, fit: "inside", withoutEnlargement: true })
					.ensureAlpha()
					.raw()
					.toBuffer({ resolveWithObject: true }),
			catch: (cause) => new YtError({ message: "Failed to decode banner image", cause })
		})
		const hash = yield* Effect.try({
			try: () => rgbaToThumbHash(info.width, info.height, data),
			catch: (cause) => new YtError({ message: "Failed to generate banner ThumbHash", cause })
		})
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
		if (!item) {
			return yield* new YtError({ message: `Channel ${ytChannelId} not found` })
		}

		const channel = yield* decodeYtChannelItem(item).pipe(
			Effect.mapError(
				(cause) =>
					new YtError({
						message: `Channel ${ytChannelId} returned invalid details`,
						cause
					})
			)
		)

		const { snippet, statistics, brandingSettings } = channel

		const bannerUrl = brandingSettings?.image?.bannerExternalUrl ?? ""
		const ytBannerThumbHash = bannerUrl
			? yield* generateBannerThumbHash(bannerUrl).pipe(
					Effect.catchTag("YtError", (error) =>
						Effect.logWarning("Failed to generate banner ThumbHash", {
							ytChannelId,
							cause: error
						}).pipe(Effect.as(null))
					)
				)
			: null

		return {
			ytChannelId: channel.id,
			ytName: snippet.title,
			ytHandle: snippet.customUrl ?? "",
			ytDescription: snippet.description ?? "",
			ytAvatarUrl: getThumbnailUrl(item),
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
