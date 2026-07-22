import { liveBroadcastContent, privacyStatusEnum, uploadStatusEnum } from "@hc/db/schema"
import * as Schema from "effect/Schema"
import { CountFromString, YtItemsResponse, YtThumbnails } from "../shared"

const YtVideoItem = Schema.Struct({
	id: Schema.NonEmptyString,
	snippet: Schema.Struct({
		channelId: Schema.NonEmptyString,
		title: Schema.NonEmptyString,
		thumbnails: Schema.optionalKey(Schema.NullOr(YtThumbnails)),
		publishedAt: Schema.DateFromString,
		liveBroadcastContent: Schema.Literals(liveBroadcastContent)
	}),
	status: Schema.Struct({
		privacyStatus: Schema.Literals(privacyStatusEnum.enumValues),
		uploadStatus: Schema.Literals(uploadStatusEnum.enumValues)
	}),
	statistics: Schema.Struct({
		viewCount: Schema.optionalKey(Schema.NullOr(CountFromString)),
		likeCount: Schema.optionalKey(Schema.NullOr(CountFromString)),
		commentCount: Schema.optionalKey(Schema.NullOr(CountFromString))
	}),
	contentDetails: Schema.Struct({
		duration: Schema.optionalKey(Schema.NullOr(Schema.NonEmptyString))
	}),
	liveStreamingDetails: Schema.optionalKey(
		Schema.Struct({
			scheduledStartTime: Schema.optionalKey(Schema.NullOr(Schema.DateFromString)),
			actualStartTime: Schema.optionalKey(Schema.NullOr(Schema.DateFromString)),
			concurrentViewers: Schema.optionalKey(Schema.NullOr(CountFromString))
		})
	)
})

const YtVideoResponse = YtItemsResponse(YtVideoItem)

export type YtVideo = typeof YtVideoItem.Type

export const decodeYtVideoResponse = Schema.decodeUnknownEffect(YtVideoResponse)
