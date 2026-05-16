import { PgClient } from '@effect/sql-pg';
import * as Effect from 'effect/Effect';
import * as Redacted from 'effect/Redacted';
import * as PgDrizzle from 'drizzle-orm/effect-postgres';
import { relations } from './relations';

export const PgClientLive = PgClient.layer({
	url: Redacted.make(Bun.env.DATABASE_URL!)
});

export const DB = PgDrizzle.make({ relations }).pipe(Effect.provide(PgDrizzle.DefaultServices));
