import { ResultAsync } from 'neverthrow';
import { dbClient } from '.';
import { DB_SCHEMA } from '@hc/db';

export const DB_QUERIES = {
	getAllChannels: async () => {
		return ResultAsync.fromPromise(
			dbClient
				.select({
					ytChannelId: DB_SCHEMA.channels.ytChannelId
				})
				.from(DB_SCHEMA.channels),
			() => new Error('Failed to get all channels')
		);
	}
};
