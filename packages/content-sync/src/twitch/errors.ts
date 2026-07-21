import * as Schema from "effect/Schema"

export class TwitchError extends Schema.TaggedErrorClass<TwitchError>()("TwitchError", {
	reason: Schema.Literals(["invalid-response", "request-failed", "timeout"]),
	message: Schema.String
}) {}
