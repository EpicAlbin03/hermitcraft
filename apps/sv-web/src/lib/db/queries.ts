import { ResultAsync } from 'neverthrow';
import { dbClient } from '.';
import { and, DB_SCHEMA, desc, eq, not } from '@hc/db';
import { parseIsoDurationToSeconds } from '$lib/format-duration';

export type VideoFilter = 'videos' | 'shorts' | 'livestreams';

export const DB_QUERIES = {
	getSidebarChannels: async () => {
		const channelsResult = await ResultAsync.fromPromise(
			dbClient
				.select({
					name: DB_SCHEMA.channels.name,
					handle: DB_SCHEMA.channels.handle,
					thumbnailUrl: DB_SCHEMA.channels.thumbnailUrl
				})
				.from(DB_SCHEMA.channels)
				.orderBy(DB_SCHEMA.channels.name),
			(error) => {
				console.error('DB QUERIES.getSidebarChannels:', error);
				return new Error('Failed to get sidebar channels');
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

	getChannelByHandle: async (handle: string) => {
		const channelResult = await ResultAsync.fromPromise(
			dbClient
				.select({
					ytChannelId: DB_SCHEMA.channels.ytChannelId,
					name: DB_SCHEMA.channels.name,
					thumbnailUrl: DB_SCHEMA.channels.thumbnailUrl,
					bannerUrl: DB_SCHEMA.channels.bannerUrl,
					description: DB_SCHEMA.channels.description,
					viewCount: DB_SCHEMA.channels.viewCount,
					subscriberCount: DB_SCHEMA.channels.subscriberCount,
					videoCount: DB_SCHEMA.channels.videoCount
				})
				.from(DB_SCHEMA.channels)
				.where(eq(DB_SCHEMA.channels.handle, handle))
				.limit(1),
			(error) => {
				console.error('DB QUERIES.getChannelByHandle:', error);
				return new Error('Failed to get channel by handle');
			}
		);

		return channelResult.match(
			(channel) => {
				return {
					status: 'success' as const,
					data: channel[0]
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

	getChannelVideos: async (
		ytChannelId: string,
		limit: number,
		offset: number,
		filter: VideoFilter
	) => {
		const videosResult = await ResultAsync.fromPromise(
			dbClient
				.select({
					ytVideoId: DB_SCHEMA.videos.ytVideoId,
					title: DB_SCHEMA.videos.title,
					thumbnailUrl: DB_SCHEMA.videos.thumbnailUrl,
					publishedAt: DB_SCHEMA.videos.publishedAt,
					viewCount: DB_SCHEMA.videos.viewCount,
					likeCount: DB_SCHEMA.videos.likeCount,
					commentCount: DB_SCHEMA.videos.commentCount,
					duration: DB_SCHEMA.videos.duration,
					isLiveStream: DB_SCHEMA.videos.isLiveStream
				})
				.from(DB_SCHEMA.videos)
				.where(() => {
					if (filter === 'livestreams') {
						return and(
							eq(DB_SCHEMA.videos.ytChannelId, ytChannelId),
							eq(DB_SCHEMA.videos.isLiveStream, true)
						);
					} else if (filter === 'shorts') {
						// Add isShort to db
						return and(
							eq(DB_SCHEMA.videos.ytChannelId, ytChannelId),
							isShort(DB_SCHEMA.videos.duration)
						);
					} else {
						return eq(DB_SCHEMA.videos.ytChannelId, ytChannelId);
					}
				})
				.orderBy(desc(DB_SCHEMA.videos.publishedAt))
				.limit(limit)
				.offset(offset),
			(error) => {
				console.error('DB QUERIES.getChannelVideos:', error);
				return new Error('Failed to get channel videos');
			}
		);

		return videosResult.match(
			(videos) => {
				return {
					status: 'success' as const,
					data: videos.map((video) => ({
						...video,
						isShort: isShort(video.duration)
					}))
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

	getAllVideos: async (limit: number, offset: number) => {
		const videosResult = await ResultAsync.fromPromise(
			dbClient
				.select({
					ytVideoId: DB_SCHEMA.videos.ytVideoId,
					title: DB_SCHEMA.videos.title,
					thumbnailUrl: DB_SCHEMA.videos.thumbnailUrl,
					publishedAt: DB_SCHEMA.videos.publishedAt,
					viewCount: DB_SCHEMA.videos.viewCount,
					likeCount: DB_SCHEMA.videos.likeCount,
					commentCount: DB_SCHEMA.videos.commentCount,
					duration: DB_SCHEMA.videos.duration,
					isLiveStream: DB_SCHEMA.videos.isLiveStream
				})
				.from(DB_SCHEMA.videos)
				.orderBy(desc(DB_SCHEMA.videos.publishedAt))
				.limit(limit)
				.offset(offset),
			(error) => {
				console.error('DB QUERIES.getAllVideos:', error);
				return new Error('Failed to get all videos');
			}
		);

		return videosResult.match(
			(videos) => {
				return {
					status: 'success' as const,
					data: videos.map((video) => ({
						...video,
						isShort: isShort(video.duration)
					}))
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

// TODO: Better check for shorts
function isShort(duration: string) {
	const durationSeconds = parseIsoDurationToSeconds(duration);
	if (durationSeconds === null) return false;
	return durationSeconds <= 3 * 60;
}
