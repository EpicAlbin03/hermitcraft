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
	const ISO_DURATION_PATTERN = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/
	const match = ISO_DURATION_PATTERN.exec(duration)
	if (!match) return null

	const days = Number.parseInt(match[1] ?? "0", 10)
	const hours = Number.parseInt(match[2] ?? "0", 10)
	const minutes = Number.parseInt(match[3] ?? "0", 10)
	const seconds = Number.parseInt(match[4] ?? "0", 10)

	const totalSeconds = ((days * 24 + hours) * 60 + minutes) * 60 + seconds
	return Number.isNaN(totalSeconds) ? null : totalSeconds
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
