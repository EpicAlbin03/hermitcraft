import * as Effect from "effect/Effect"
import { YtError } from "../errors"

// YouTube does not officially document these derived playlist ID prefixes.
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

export const validateYtChannelId = Effect.fn("YtService.validateYtChannelId")(function* (
	ytChannelId: string
) {
	if (!ytChannelId.startsWith("UC")) {
		return yield* YtError.make({
			reason: "invalid-input",
			message: `Invalid YouTube channel ID: ${ytChannelId}`
		})
	}
	return ytChannelId
})

export const getYtPlaylistId = Effect.fn("YtService.getYtPlaylistId")(function* (
	ytChannelId: string,
	type: YtPlaylistType
) {
	const channelId = yield* validateYtChannelId(ytChannelId)
	return `${ytPlaylistPrefixes[type]}${channelId.slice(2)}`
})
