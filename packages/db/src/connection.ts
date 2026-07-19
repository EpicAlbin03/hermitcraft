import { PgClient } from "@effect/sql-pg"
import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import * as PgDrizzle from "drizzle-orm/effect-postgres"
import { relations } from "./relations"

export const PgClientLive = PgClient.layerConfig({
	url: Config.redacted("DATABASE_URL")
})

export const DB = PgDrizzle.make({ relations }).pipe(Effect.provide(PgDrizzle.DefaultServices))
