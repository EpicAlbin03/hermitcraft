import { DB_SCHEMA, Db, DbError } from '@hc/db';
import { Effect } from 'effect';

const dbService = Effect.gen(function* () {
	const db = yield* Db;

	const getAllChannels = () =>
		db
			.select()
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

// export DbService
