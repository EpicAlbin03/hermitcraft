import { ApiClient } from "@twurple/api"
import { AppTokenAuthProvider } from "@twurple/auth"
import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"
import { TwitchError } from "./errors"
import { makeStreamMethods } from "./streams"

export class TwitchService extends Context.Service<
	TwitchService,
	{
		isChannelLive(userId: string): Effect.Effect<boolean, TwitchError>
		areChannelsLive(userIds: string[]): Effect.Effect<Map<string, boolean>, TwitchError>
	}
>()("@hc/content-sync/twitch/service/TwitchService") {
	static readonly layer = Layer.effect(
		TwitchService,
		Effect.gen(function* () {
			const clientId = Redacted.value(yield* Config.redacted("TWITCH_CLIENT_ID"))
			const clientSecret = Redacted.value(yield* Config.redacted("TWITCH_CLIENT_SECRET"))

			const authProvider = new AppTokenAuthProvider(clientId, clientSecret)
			const twitchApi = new ApiClient({ authProvider })

			return TwitchService.of(makeStreamMethods(twitchApi))
		})
	)
}

export type TwitchServiceType = TwitchService["Service"]
