import { youtube_v3 as yt_v3 } from "googleapis"
import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"

export const CountFromString = Schema.FiniteFromString.check(
	Schema.isInt(),
	Schema.isGreaterThanOrEqualTo(0)
)

export const parseDate = (value: string | null | undefined) =>
	DateTime.toDate(DateTime.makeUnsafe(value ?? 0))

export const getThumbnailUrl = (item: yt_v3.Schema$Video | yt_v3.Schema$Channel) => {
	const thumbnail =
		item.snippet?.thumbnails?.maxres ||
		item.snippet?.thumbnails?.standard ||
		item.snippet?.thumbnails?.high ||
		item.snippet?.thumbnails?.medium ||
		item.snippet?.thumbnails?.default
	return thumbnail?.url || ""
}
