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

const ytPlaylistPrefixes = {
	videos: "UULF", // Doesn't include shorts and livestreams
	popularVideos: "UULP",
	livestreams: "UULV",
	membersOnlyVideos: "UUMF",
	membersOnlyContents: "UUMO",
	membersOnlyShorts: "UUMS",
	membersOnlyLivestreams: "UUMV",
	popularShorts: "UUPS",
	popularLivestreams: "UUPV",
	shorts: "UUSH"
} as const

type YtPlaylistType = keyof typeof ytPlaylistPrefixes

export function getYtPlaylistId(ytChannelId: string, type: YtPlaylistType) {
	if (!ytChannelId.startsWith("UC")) return null
	return `${ytPlaylistPrefixes[type]}${ytChannelId.slice(2)}`
}

export function getVideoLivestreamType(
	liveBroadcastContent: "live" | "none" | "upcoming",
	hasBeenLivestream: boolean
) {
	if (liveBroadcastContent !== "none") return liveBroadcastContent
	return hasBeenLivestream ? "completed" : "none"
}
