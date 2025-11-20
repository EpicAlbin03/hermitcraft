import { ResultAsync } from 'neverthrow';
import { DB_SCHEMA, eq, dbClient } from '@hc/db';

export const DB_QUERIES = {
	getAllChannels: () => {
		return ResultAsync.fromPromise(
			dbClient.select().from(DB_SCHEMA.channels),
			() => new Error('Failed to get all channels')
		);
	},

	getChannel: (ytChannelId: string) => {
		return ResultAsync.fromPromise(
			dbClient
				.select()
				.from(DB_SCHEMA.channels)
				.where(eq(DB_SCHEMA.channels.ytChannelId, ytChannelId))
				.limit(1),
			() => new Error(`Failed to get channel ${ytChannelId}`)
		).map((channels) => channels[0] || null);
	},

	getVideo: (ytVideoId: string) => {
		return ResultAsync.fromPromise(
			dbClient
				.select()
				.from(DB_SCHEMA.videos)
				.where(eq(DB_SCHEMA.videos.ytVideoId, ytVideoId))
				.limit(1),
			() => new Error(`Failed to get video ${ytVideoId}`)
		).map((videos) => videos[0] || null);
	}
};
