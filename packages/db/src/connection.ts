import { PgClient } from '@effect/sql-pg';
import * as PgDrizzle from 'drizzle-orm/effect-postgres';
import type { EffectPgDatabase } from 'drizzle-orm/effect-postgres';
import { Config, Context, Effect, Layer, Redacted } from 'effect';
import { TaggedError } from 'effect/Data';
import { types } from 'pg';
import * as mySchema from './schema';

const DRIZZLE_DATE_TIME_TYPE_IDS = [1184, 1114, 1082, 1186, 1231, 1115, 1185, 1187, 1182];

