import * as Data from "effect/Data"

export class TwitchError extends Data.TaggedError("TwitchError")<{
	message: string
	cause?: unknown
}> {}
