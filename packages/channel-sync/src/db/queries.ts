import { ResultAsync } from 'neverthrow';
import { dbClient } from '.';
import { DB_SCHEMA, eq } from '@hc/db';

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
			() => new Error('Failed to get channel')
		).map((channels) => channels[0] || null);
	},

	getVideo: (ytVideoId: string) => {
		return ResultAsync.fromPromise(
			dbClient
				.select()
				.from(DB_SCHEMA.videos)
				.where(eq(DB_SCHEMA.videos.ytVideoId, ytVideoId))
				.limit(1),
			() => new Error('Failed to get video')
		).map((videos) => videos[0] || null);
	}
};
