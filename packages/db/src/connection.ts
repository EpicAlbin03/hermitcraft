import type { SqlError } from '@effect/sql/SqlError';
import { PgClient } from '@effect/sql-pg';
import * as PgDrizzle from 'drizzle-orm/effect-postgres';
import type { EffectPgDatabase } from 'drizzle-orm/effect-postgres';
import * as Effect from 'effect/Effect';
import * as Redacted from 'effect/Redacted';
import { types } from 'pg';
import * as mySchema from './schema';

const DRIZZLE_DATE_TIME_TYPE_IDS = [1184, 1114, 1082, 1186, 1231, 1115, 1185, 1187, 1182];

export const getPgClientLayer = (dbUrl: string): ReturnType<typeof PgClient.layer> =>
	PgClient.layer({
		url: Redacted.make(dbUrl),
		types: {
			getTypeParser: (typeId, format) => {
				if (DRIZZLE_DATE_TIME_TYPE_IDS.includes(typeId)) {
					return (value: string) => value;
				}

				return types.getTypeParser(typeId, format);
			}
		}
	});

export type DbConnection = EffectPgDatabase<typeof mySchema> & { $client: PgClient.PgClient };

export const getDrizzleInstance = (dbUrl: string): Effect.Effect<DbConnection, SqlError> =>
	PgDrizzle.makeWithDefaults({ schema: mySchema }).pipe(Effect.provide(getPgClientLayer(dbUrl)));
