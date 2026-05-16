import { DB } from '@hc/db/connection';
import { DB_SCHEMA, type Channel } from '@hc/db/schema';
import { Context, Effect } from 'effect';
import * as Data from 'effect/Data';
import { getColumns } from 'drizzle-orm';

class DbError extends Data.TaggedError('DbError')<{ message: string; cause?: unknown }> { }

const {
	createdAt,
	modifiedAt,
	...channelColumns
} = getColumns(DB_SCHEMA.channels);

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

	return {
		getAllChannels
	};
});

type DbServiceShape = Effect.Success<typeof dbService>;

export class DbService extends Context.Service<DbService, DbServiceShape>()(
	"@hc/content-sync/db/DbService"
) { }