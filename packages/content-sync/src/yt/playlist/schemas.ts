import * as Schema from "effect/Schema"
import { YtItemsResponse, YtPaginatedItemsResponse } from "../shared"

const YtChannelPlaylistItem = Schema.Struct({
	contentDetails: Schema.Struct({
		relatedPlaylists: Schema.Struct({
			uploads: Schema.NonEmptyString
		})
	})
})

const YtChannelPlaylistResponse = YtItemsResponse(YtChannelPlaylistItem)

const YtPlaylistItem = Schema.Struct({
	contentDetails: Schema.Struct({
		videoId: Schema.NonEmptyString
	})
})

const YtPlaylistItemId = Schema.Struct({
	id: Schema.NonEmptyString
})

const YtPlaylistPage = YtPaginatedItemsResponse(Schema.Unknown)

export const decodeYtChannelPlaylistResponse = Schema.decodeUnknownEffect(YtChannelPlaylistResponse)
export const decodeYtPlaylistPage = Schema.decodeUnknownEffect(YtPlaylistPage)
export const decodeYtPlaylistItems = Schema.decodeUnknownEffect(Schema.Array(YtPlaylistItem))
export const decodeYtPlaylistItemIds = Schema.decodeUnknownEffect(Schema.Array(YtPlaylistItemId))
