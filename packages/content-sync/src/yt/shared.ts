import * as Schema from "effect/Schema"

export const CountFromString = Schema.FiniteFromString.check(
	Schema.isInt(),
	Schema.isGreaterThanOrEqualTo(0)
)

const YtThumbnail = Schema.Struct({
	url: Schema.optionalKey(Schema.NullOr(Schema.String))
})

export const YtThumbnails = Schema.Struct({
	default: Schema.optionalKey(Schema.NullOr(YtThumbnail)),
	medium: Schema.optionalKey(Schema.NullOr(YtThumbnail)),
	high: Schema.optionalKey(Schema.NullOr(YtThumbnail)),
	standard: Schema.optionalKey(Schema.NullOr(YtThumbnail)),
	maxres: Schema.optionalKey(Schema.NullOr(YtThumbnail))
})

type YtThumbnailsType = typeof YtThumbnails.Type

export const getThumbnailUrl = (thumbnails: YtThumbnailsType | null | undefined) =>
	thumbnails?.maxres?.url ||
	thumbnails?.standard?.url ||
	thumbnails?.high?.url ||
	thumbnails?.medium?.url ||
	thumbnails?.default?.url ||
	""
