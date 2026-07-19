import * as Effect from "effect/Effect"
import * as HttpClient from "effect/unstable/http/HttpClient"
import { XMLParser } from "fast-xml-parser"
import { YtError } from "./service"

type YtRss = {
	feed?: {
		entry?: {
			"yt:videoId"?: string
		}[]
	}
}

const ytRssParser = new XMLParser({
	ignoreAttributes: false,
	parseTagValue: false,
	isArray: (_tagName, jPath) => jPath === "feed.entry"
})

export function parseYtRSS(xml: string) {
	const rss = ytRssParser.parse(xml) as YtRss
	return (
		rss.feed?.entry
			?.map((entry) => entry["yt:videoId"])
			.filter((videoId) => videoId !== undefined) ?? []
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
				Effect.map(parseYtRSS),
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
