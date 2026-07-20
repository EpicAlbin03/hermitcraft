import type { Creator } from "@hc/db/schema"
import { youtube_v3 as yt_v3 } from "googleapis"
import sharp from "sharp"
import * as Effect from "effect/Effect"
import * as HttpClient from "effect/unstable/http/HttpClient"
import { rgbaToThumbHash, thumbHashToDataURL } from "thumbhash"
import { YtError } from "./errors"
import { getThumbnailUrl, parseDate } from "./shared"

export type ChannelDetails = Pick<Creator, Extract<keyof Creator, `yt${string}`>>

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

		const bannerUrl = item.brandingSettings?.image?.bannerExternalUrl ?? ""
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
			ytChannelId: item.id,
			ytName: item.snippet.title ?? "",
			ytHandle: item.snippet.customUrl ?? "",
			ytDescription: item.snippet.description ?? "",
			ytAvatarUrl: getThumbnailUrl(item),
			ytBannerUrl: bannerUrl,
			ytBannerThumbHash,
			ytViewCount: parseInt(item.statistics?.viewCount ?? "0", 10),
			ytSubscriberCount: parseInt(item.statistics?.subscriberCount ?? "0", 10),
			ytVideoCount: parseInt(item.statistics?.videoCount ?? "0", 10),
			ytJoinedAt: parseDate(item.snippet.publishedAt)
		} satisfies ChannelDetails
	})

	return { getChannelDetails }
}
