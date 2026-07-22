import sharp from "sharp"
import * as Effect from "effect/Effect"
import * as Encoding from "effect/Encoding"
import * as HttpClient from "effect/unstable/http/HttpClient"
import { rgbaToThumbHash } from "thumbhash"
import { REQUEST_DEADLINE } from "../../constants"
import { YtError } from "../errors"

export const makeBannerMethods = (httpClient: HttpClient.HttpClient) => {
	const generateBannerThumbHash = Effect.fn("YtService.generateBannerThumbHash")(function* (
		bannerUrl: string
	) {
		const buffer = yield* httpClient.get(`${bannerUrl}=w100`).pipe(
			Effect.flatMap((response) => response.arrayBuffer),
			Effect.mapError(() =>
				YtError.make({
					reason: "request-failed",
					message: "Failed to fetch banner for thumbhash"
				})
			),
			Effect.timeoutOrElse({
				duration: REQUEST_DEADLINE,
				orElse: () =>
					Effect.fail(
						YtError.make({
							reason: "timeout",
							message: "Timed out fetching banner for thumbhash"
						})
					)
			})
		)
		const { data, info } = yield* Effect.tryPromise({
			try: () =>
				sharp(new Uint8Array(buffer))
					.resize({ width: 100, height: 100, fit: "inside", withoutEnlargement: true })
					.ensureAlpha()
					.raw()
					.toBuffer({ resolveWithObject: true }),
			catch: () =>
				YtError.make({ reason: "processing-failed", message: "Failed to decode banner image" })
		})
		const hash = yield* Effect.try({
			try: () => rgbaToThumbHash(info.width, info.height, data),
			catch: () =>
				YtError.make({
					reason: "processing-failed",
					message: "Failed to generate banner ThumbHash"
				})
		})
		return Encoding.encodeBase64(hash)
	})

	return { generateBannerThumbHash }
}
