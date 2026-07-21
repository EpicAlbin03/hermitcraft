import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as HttpClient from "effect/unstable/http/HttpClient"
import { XMLParser } from "fast-xml-parser"
import { REQUEST_DEADLINE } from "../constants"
import { YtError } from "./errors"

const YtRss = Schema.Struct({
	feed: Schema.Struct({
		entry: Schema.Array(
			Schema.Struct({
				"yt:videoId": Schema.NonEmptyString
			})
		).pipe(Schema.withDecodingDefaultKey(Effect.succeed([])))
	})
})

const decodeYtRss = Schema.decodeUnknownEffect(YtRss)

const ytRssParser = new XMLParser({
	ignoreAttributes: false,
	parseTagValue: false,
	isArray: (_tagName, jPath) => jPath === "feed.entry"
})

const parseYtRSS = Effect.fn("YtService.parseYtRSS")(function* (xml: string) {
	const parsed = yield* Effect.try({
		try: () => {
			const value: unknown = ytRssParser.parse(xml)
			return value
		},
		catch: () =>
			YtError.make({ reason: "invalid-response", message: "Failed to parse YouTube RSS" })
	})
	const rss = yield* decodeYtRss(parsed).pipe(
		Effect.mapError(() =>
			YtError.make({ reason: "invalid-response", message: "YouTube RSS returned invalid data" })
		)
	)
	return rss.feed.entry.map((entry) => entry["yt:videoId"])
})

export const makeRssMethods = (httpClient: HttpClient.HttpClient) => {
	const getRSSVideoIds = Effect.fn("YtService.getRSSVideoIds")(function* (ytChannelId: string) {
		const xml = yield* httpClient
			.get("https://www.youtube.com/feeds/videos.xml", {
				urlParams: { channel_id: ytChannelId }
			})
			.pipe(
				Effect.flatMap((response) => response.text),
				Effect.mapError(() =>
					YtError.make({
						reason: "request-failed",
						message: `Failed to fetch RSS for channel ${ytChannelId}`
					})
				),
				Effect.timeoutOrElse({
					duration: REQUEST_DEADLINE,
					orElse: () =>
						Effect.fail(
							YtError.make({
								reason: "timeout",
								message: `Timed out fetching RSS for channel ${ytChannelId}`
							})
						)
				})
			)
		return yield* parseYtRSS(xml)
	})

	return { getRSSVideoIds }
}
