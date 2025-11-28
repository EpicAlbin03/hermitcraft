import { err, ResultAsync } from 'neverthrow';
import { DB_SCHEMA, eq, dbClient, type Channel, type Video } from '@hc/db';
import { DB_QUERIES } from './queries';

export const DB_MUTATIONS = {
	upsertChannel: (data: Omit<Channel, 'createdAt'>) => {
		return DB_QUERIES.getChannel(data.ytChannelId).andThen((existing) => {
			if (existing) {
				return ResultAsync.fromPromise(
					dbClient
						.update(DB_SCHEMA.channels)
						.set({
							description: data.description,
							thumbnailUrl: data.thumbnailUrl,
							bannerUrl: data.bannerUrl,
							viewCount: data.viewCount,
							subscriberCount: data.subscriberCount,
							videoCount: data.videoCount
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
						thumbnailUrl: data.thumbnailUrl,
						bannerUrl: data.bannerUrl,
						handle: data.handle,
						viewCount: data.viewCount,
						subscriberCount: data.subscriberCount,
						videoCount: data.videoCount,
						joinedAt: data.joinedAt
					}),
					() => new Error('Failed to insert channel')
				).map(() => ({ ytChannelId: data.ytChannelId, wasInserted: true }));
			}
		});
	},
	upsertVideo: (data: Omit<Video, 'createdAt'>) => {
		return DB_QUERIES.getVideo(data.ytVideoId).andThen((existing) => {
			if (existing) {
				return ResultAsync.fromPromise(
					dbClient
						.update(DB_SCHEMA.videos)
						.set({
							title: data.title,
							thumbnailUrl: data.thumbnailUrl,
							viewCount: data.viewCount,
							likeCount: data.likeCount,
							commentCount: data.commentCount,
							duration: data.duration,
							isLiveStream: data.isLiveStream
						})
						.where(eq(DB_SCHEMA.videos.ytVideoId, data.ytVideoId)),
					() => new Error('Failed to update video')
				).map(() => ({ ytVideoId: data.ytVideoId, wasInserted: false }));
			} else {
				if (data.duration === 'P0D') {
					return err(new Error('Video duration is 0'));
				}
				return ResultAsync.fromPromise(
					dbClient.insert(DB_SCHEMA.videos).values({
						ytVideoId: data.ytVideoId,
						ytChannelId: data.ytChannelId,
						title: data.title,
						thumbnailUrl: data.thumbnailUrl,
						publishedAt: data.publishedAt,
						viewCount: data.viewCount,
						likeCount: data.likeCount,
						commentCount: data.commentCount,
						duration: data.duration,
						isLiveStream: data.isLiveStream
					}),
					() => new Error('Failed to insert video')
				).map(() => ({ ytVideoId: data.ytVideoId, wasInserted: true }));
			}
		});
	}
};
