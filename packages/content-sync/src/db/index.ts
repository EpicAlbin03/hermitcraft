import { DB } from '@hc/db/connection';
import { DB_SCHEMA, type Channel } from '@hc/db/schema';
import * as Option from 'effect/Option';
import * as Effect from 'effect/Effect';
import * as Context from 'effect/Context';
import * as Data from 'effect/Data';
import { eq, getColumns } from 'drizzle-orm';

class DbError extends Data.TaggedError('DbError')<{ message: string; cause?: unknown }> {}

const { createdAt, modifiedAt, ...channelColumns } = getColumns(DB_SCHEMA.channels);

const dbService = Effect.gen(function* () {
	const db = yield* DB;

	const getAllChannels = (): Effect.Effect<Channel[], DbError> =>
		db
			.select(channelColumns)
			.from(DB_SCHEMA.channels)
			.pipe(
				Effect.mapError(
					(cause) =>
						new DbError({
							message: 'Failed to get all channels...',
							cause
						})
				)
			);

	const getChannel = (ytChannelId: string): Effect.Effect<Option.Option<Channel>, DbError> =>
		db
			.select(channelColumns)
			.from(DB_SCHEMA.channels)
			.where(eq(DB_SCHEMA.channels.ytChannelId, ytChannelId))
			.limit(1)
			.pipe(
				Effect.map(([channel]) => Option.fromNullishOr(channel)),
				Effect.mapError(
					(cause) =>
						new DbError({
							message: 'Failed to get channel',
							cause
						})
				)
			);

	return {
		getAllChannels,
		getChannel
	};
});

type DbServiceShape = Effect.Success<typeof dbService>;

export class DbService extends Context.Service<DbService, DbServiceShape>()(
	'@hc/content-sync/db/DbService'
) {}
