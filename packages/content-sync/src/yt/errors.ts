import * as Schema from "effect/Schema"

export class YtError extends Schema.TaggedErrorClass<YtError>()("YtError", {
	reason: Schema.Literals([
		"invalid-input",
		"invalid-response",
		"not-found",
		"processing-failed",
		"request-failed",
		"timeout"
	]),
	message: Schema.String
}) {}
