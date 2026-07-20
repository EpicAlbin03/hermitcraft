import { google } from "googleapis"
import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"
import * as Schedule from "effect/Schedule"
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient"
import * as HttpClient from "effect/unstable/http/HttpClient"
import { makeChannelMethods, type ChannelDetails } from "./channel"
import { makePlaylistMethods } from "./playlists"
import { makeRssMethods } from "./rss"
import { YtError } from "./errors"
import { makeVideoMethods, type VideoDetails } from "./videos"

export class YtService extends Context.Service<
	YtService,
	{
		getChannelDetails(ytChannelId: string): Effect.Effect<ChannelDetails, YtError>
		getVideoDetails(ytVideoId: string): Effect.Effect<VideoDetails, YtError>
		getBatchVideoDetails(ytVideoIds: string[]): Effect.Effect<Map<string, VideoDetails>, YtError>
		getVideoIdsFromUploadsPlaylist(
			ytChannelId: string,
			maxResults?: number
		): Effect.Effect<string[], YtError>
		getRSSVideoIds(ytChannelId: string): Effect.Effect<string[], YtError>
		isVideoShort(ytVideoId: string, ytChannelId: string): Effect.Effect<boolean, YtError>
		areVideosShorts(
			ytVideoIds: string[],
			ytChannelId: string,
			maxResults?: number
		): Effect.Effect<Map<string, boolean>, YtError>
		getLiveStreamVideoIds(
			ytChannelId: string,
			maxResults?: number
		): Effect.Effect<string[], YtError>
	}
>()("@hc/content-sync/yt/service/YtService") {
	static readonly layer = Layer.effect(
		YtService,
		Effect.gen(function* () {
			const ytApiKey = Redacted.value(yield* Config.redacted("YT_API_KEY"))

			const httpClient = (yield* HttpClient.HttpClient).pipe(HttpClient.filterStatusOk)
			const retryingHttpClient = httpClient.pipe(
				HttpClient.retryTransient({
					schedule: Schedule.exponential("1 second"),
					times: 3
				})
			)

			const ytApi = google.youtube({
				version: "v3",
				auth: ytApiKey
			})

			return YtService.of({
				...makeChannelMethods(ytApi, httpClient),
				...makeVideoMethods(ytApi),
				...makePlaylistMethods(ytApi),
				...makeRssMethods(retryingHttpClient)
			})
		})
	).pipe(Layer.provide(FetchHttpClient.layer))
}

export type YtServiceType = YtService["Service"]
