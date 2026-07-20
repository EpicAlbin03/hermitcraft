import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as HttpClient from "effect/unstable/http/HttpClient"
import { XMLParser } from "fast-xml-parser"
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

function parseYtRSS(xml: string) {
	return Effect.try(() => ytRssParser.parse(xml) as unknown).pipe(
		Effect.flatMap(decodeYtRss),
		Effect.map((rss) => rss.feed.entry.map((entry) => entry["yt:videoId"]))
	)
}

export const makeRssMethods = (httpClient: HttpClient.HttpClient) => {
	const getRSSVideoIds = Effect.fn("YtService.getRSSVideoIds")(function* (ytChannelId: string) {
		return yield* httpClient
			.get("https://www.youtube.com/feeds/videos.xml", {
				urlParams: { channel_id: ytChannelId }
			})
			.pipe(
				Effect.flatMap((response) => response.text),
				Effect.flatMap(parseYtRSS),
				Effect.mapError(
					(cause) =>
						new YtError({
							message: `Failed to fetch RSS for channel ${ytChannelId}`,
							cause
						})
				)
			)
	})

	return { getRSSVideoIds }
}
