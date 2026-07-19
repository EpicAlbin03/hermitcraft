import * as Data from "effect/Data"

export class YtError extends Data.TaggedError("YtError")<{
	message: string
	cause?: unknown
}> {}
