import { ResultAsync } from 'neverthrow';
import { dbClient } from '.';
import { DB_SCHEMA, eq } from '@hc/db';
import { DB_QUERIES } from './queries';

export const DB_MUTATIONS = {
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
