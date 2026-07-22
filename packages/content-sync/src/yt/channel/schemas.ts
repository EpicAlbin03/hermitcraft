import * as Schema from "effect/Schema"
import { CountFromString, YtItemsResponse, YtThumbnails } from "../shared"

const YtChannelItem = Schema.Struct({
	id: Schema.NonEmptyString,
	snippet: Schema.Struct({
		title: Schema.NonEmptyString,
		customUrl: Schema.optionalKey(Schema.NullOr(Schema.NonEmptyString)),
		description: Schema.optionalKey(Schema.NullOr(Schema.String)),
		publishedAt: Schema.DateFromString,
		thumbnails: Schema.optionalKey(Schema.NullOr(YtThumbnails))
	}),
	statistics: Schema.Struct({
		viewCount: CountFromString,
		subscriberCount: Schema.optionalKey(Schema.NullOr(CountFromString)),
		videoCount: CountFromString,
		hiddenSubscriberCount: Schema.optionalKey(Schema.NullOr(Schema.Boolean))
	}),
	brandingSettings: Schema.optionalKey(
		Schema.Struct({
			image: Schema.optionalKey(
				Schema.Struct({
					bannerExternalUrl: Schema.optionalKey(Schema.NullOr(Schema.String))
				})
			)
		})
	)
})

const YtChannelResponse = YtItemsResponse(YtChannelItem)

export const decodeYtChannelResponse = Schema.decodeUnknownEffect(YtChannelResponse)
