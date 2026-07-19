import { Temporal } from "@js-temporal/polyfill"
import { XMLParser } from "fast-xml-parser"

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
	return rss.feed?.entry?.map((entry) => entry["yt:videoId"]) ?? []
}

export function parseIsoDurationToSeconds(duration: string) {
	return Temporal.Duration.from(duration).total("seconds")
}

export function getYtPlaylistId(
	ytChannelId: string,
	type:
		| "videos"
		| "popularVideos"
		| "livestreams"
		| "membersOnlyVideos"
		| "membersOnlyContents"
		| "membersOnlyShorts"
		| "membersOnlyLivestreams"
		| "popularShorts"
		| "popularLivestreams"
		| "shorts"
) {
	if (!ytChannelId.startsWith("UC")) {
		return null
	}

	switch (type) {
		case "videos": // Doesn't include shorts and livestreams
			return "UULF" + ytChannelId.slice(2)
		case "popularVideos":
			return "UULP" + ytChannelId.slice(2)
		case "livestreams":
			return "UULV" + ytChannelId.slice(2)
		case "membersOnlyVideos":
			return "UUMF" + ytChannelId.slice(2)
		case "membersOnlyContents":
			return "UUMO" + ytChannelId.slice(2)
		case "membersOnlyShorts":
			return "UUMS" + ytChannelId.slice(2)
		case "membersOnlyLivestreams":
			return "UUMV" + ytChannelId.slice(2)
		case "popularShorts":
			return "UUPS" + ytChannelId.slice(2)
		case "popularLivestreams":
			return "UUPV" + ytChannelId.slice(2)
		case "shorts":
			return "UUSH" + ytChannelId.slice(2)
	}
}

export function getVideoLivestreamType(
	liveBroadcastContent: "live" | "none" | "upcoming",
	hasBeenLivestream: boolean
) {
	if (liveBroadcastContent !== "none") return liveBroadcastContent
	return hasBeenLivestream ? "completed" : "none"
}
