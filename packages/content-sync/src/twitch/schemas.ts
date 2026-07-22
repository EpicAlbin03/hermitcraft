import * as Schema from "effect/Schema"

const TwitchStream = Schema.Struct({
	userId: Schema.NonEmptyString
})

const TwitchStreamsPage = Schema.Struct({
	data: Schema.Array(TwitchStream)
})

export const decodeTwitchStream = Schema.decodeUnknownEffect(Schema.NullOr(TwitchStream))
export const decodeTwitchStreamsPage = Schema.decodeUnknownEffect(TwitchStreamsPage)
