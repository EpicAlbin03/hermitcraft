import { ResultAsync } from 'neverthrow';
import { DB_SCHEMA, eq, dbClient } from '@hc/db';
import { DB_QUERIES } from './queries';

export const DB_MUTATIONS = {
	upsertChannel: (data: {
		ytChannelId: string;
		name: string;
		description: string;
		thumbnailUrl: string;
	}) => {
		return DB_QUERIES.getChannel(data.ytChannelId).andThen((existing) => {
			if (existing) {
				return ResultAsync.fromPromise(
					dbClient
						.update(DB_SCHEMA.channels)
						.set({
							name: data.name,
							description: data.description,
							thumbnailUrl: data.thumbnailUrl
						})
						.where(eq(DB_SCHEMA.channels.ytChannelId, data.ytChannelId)),
					() => new Error('Failed to update channel')
				).map(() => ({ ytChannelId: data.ytChannelId, wasInserted: false }));
			} else {
				return ResultAsync.fromPromise(
					dbClient.insert(DB_SCHEMA.channels).values({
						ytChannelId: data.ytChannelId,
						name: data.name,
						description: data.description,
						thumbnailUrl: data.thumbnailUrl
					}),
					() => new Error('Failed to insert channel')
				).map(() => ({ ytChannelId: data.ytChannelId, wasInserted: true }));
			}
		});
	},
	upsertVideo: (data: {
		ytVideoId: string;
		ytChannelId: string;
		title: string;
		description: string;
		thumbnailUrl: string;
		publishedAt: Date;
		viewCount: number;
		likeCount: number;
		commentCount: number;
	}) => {
		return DB_QUERIES.getVideo(data.ytVideoId).andThen((existing) => {
			if (existing) {
				return ResultAsync.fromPromise(
					dbClient
						.update(DB_SCHEMA.videos)
						.set({
							viewCount: data.viewCount,
							likeCount: data.likeCount,
							commentCount: data.commentCount
						})
						.where(eq(DB_SCHEMA.videos.ytVideoId, data.ytVideoId)),
					() => new Error('Failed to update video')
				).map(() => ({ ytVideoId: data.ytVideoId, wasInserted: false }));
			} else {
				return ResultAsync.fromPromise(
					dbClient.insert(DB_SCHEMA.videos).values({
						ytVideoId: data.ytVideoId,
						ytChannelId: data.ytChannelId,
						title: data.title,
						description: data.description,
						thumbnailUrl: data.thumbnailUrl,
						publishedAt: data.publishedAt,
						viewCount: data.viewCount,
						likeCount: data.likeCount,
						commentCount: data.commentCount
					}),
					() => new Error('Failed to insert video')
				).map(() => ({ ytVideoId: data.ytVideoId, wasInserted: true }));
			}
		});
	}
};
