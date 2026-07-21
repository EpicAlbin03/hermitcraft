import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { YtError } from "./errors"

export const YtItemsResponse = <Item extends Schema.Top>(item: Item) =>
	Schema.Struct({
		items: Schema.optionalKey(Schema.NullOr(Schema.Array(item)))
	})

export const YtPaginatedItemsResponse = <Item extends Schema.Top>(item: Item) =>
	Schema.Struct({
		...YtItemsResponse(item).fields,
		nextPageToken: Schema.optionalKey(Schema.NullOr(Schema.NonEmptyString))
	})

export const validateIntegerInRange = Effect.fn("YtService.validateIntegerInRange")(function* (
	value: number,
	options: {
		name: string
		minimum: number
		maximum: number
	}
) {
	if (
		!Number.isFinite(value) ||
		!Number.isSafeInteger(value) ||
		value < options.minimum ||
		value > options.maximum
	) {
		return yield* YtError.make({
			reason: "invalid-input",
			message: `${options.name} must be a finite safe integer between ${options.minimum} and ${options.maximum}`
		})
	}
	return value
})

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
