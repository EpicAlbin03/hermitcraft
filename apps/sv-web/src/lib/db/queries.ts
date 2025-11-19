import { ResultAsync } from 'neverthrow';
import { dbClient } from '.';
import { DB_SCHEMA, eq, desc } from '@hc/db';

export const DB_QUERIES = {
	getAllChannels: async () => {
		const channelsResult = await ResultAsync.fromPromise(
			dbClient.select().from(DB_SCHEMA.channels),
			(error) => {
				console.error('DB QUERIES.getAllChannels:', error);
				return new Error('Failed to get all channels');
			}
		);

		return channelsResult.match(
			(channels) => {
				return {
					status: 'success' as const,
					data: channels
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
	},

	getChannelDetails: async (ytChannelId: string) => {
		const result = await ResultAsync.fromPromise(
			dbClient
				.select()
				.from(DB_SCHEMA.channels)
				.where(eq(DB_SCHEMA.channels.ytChannelId, ytChannelId))
				.limit(1),
			(error) => {
				console.error('DB QUERIES.getChannelDetails:', error);
				return new Error('Failed to get channel details');
			}
		);

		return result.match(
			(channels) => {
				return {
					status: 'success' as const,
					data: channels[0] || null
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
	},

	getChannelVideos: async (ytChannelId: string) => {
		const result = await ResultAsync.fromPromise(
			dbClient
				.select({
					video: DB_SCHEMA.videos
				})
				.from(DB_SCHEMA.videos)
				.where(eq(DB_SCHEMA.videos.ytChannelId, ytChannelId))
				.orderBy(desc(DB_SCHEMA.videos.publishedAt))
				.limit(50),
			(error) => {
				console.error('DB QUERIES.getChannelVideos:', error);
				return new Error('Failed to get channel videos');
			}
		);

		return result.match(
			(videos) => {
				return {
					status: 'success' as const,
					data: videos
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
	},

	getVideoDetails: async (ytVideoId: string) => {
		const videoResult = await ResultAsync.fromPromise(
			dbClient
				.select()
				.from(DB_SCHEMA.videos)
				.where(eq(DB_SCHEMA.videos.ytVideoId, ytVideoId))
				.limit(1),
			(error) => {
				console.error('DB QUERIES.getVideoDetails (video):', error);
				return new Error('Failed to get video');
			}
		);

		const videoMatch = await videoResult;
		if (videoMatch.isErr()) {
			return {
				status: 'error' as const,
				message: videoMatch.error.message,
				cause: videoMatch.error
			};
		}

		const video = videoMatch.value[0];
		if (!video) {
			return {
				status: 'error' as const,
				message: 'Video not found',
				cause: null
			};
		}

		const channelResult = await ResultAsync.fromPromise(
			dbClient
				.select()
				.from(DB_SCHEMA.channels)
				.where(eq(DB_SCHEMA.channels.ytChannelId, video.ytChannelId))
				.limit(1),
			(error) => {
				console.error('DB QUERIES.getVideoDetails (channel):', error);
				return new Error('Failed to get channel');
			}
		);

		const channelMatch = await channelResult;

		if (channelMatch.isErr()) {
			return {
				status: 'error' as const,
				message: channelMatch.error.message,
				cause: channelMatch.error
			};
		}

		const channel = channelMatch.value[0] || null;

		return {
			status: 'success' as const,
			data: {
				video,
				channel
			}
		};
	}
};
