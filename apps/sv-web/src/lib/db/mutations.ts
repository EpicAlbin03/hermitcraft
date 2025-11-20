import { ResultAsync } from 'neverthrow';
import { dbClient } from '.';
import { DB_SCHEMA } from '@hc/db';

export const DB_MUTATIONS = {
	createChannel: async (data: {
		ytChannelId: string;
		name: string;
		description: string;
		thumbnailUrl: string;
		customUrl: string;
	}) => {
		const createChannelResult = await ResultAsync.fromPromise(
			dbClient.insert(DB_SCHEMA.channels).values({
				ytChannelId: data.ytChannelId,
				name: data.name,
				description: data.description,
				thumbnailUrl: data.thumbnailUrl,
				customUrl: data.customUrl
			}),
			(error) => {
				console.error(`DB MUTATIONS.createChannel: ${error}`);
				return new Error(`Failed to create channel`);
			}
		);

		return createChannelResult.match(
			(result) => {
				return {
					status: 'success' as const,
					data: result
				};
			},
			(error) => {
				return {
					status: 'error' as const,
					message: error.message,
					cause: error
				};
			}
		);
	}
};
