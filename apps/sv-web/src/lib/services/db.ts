import { DB_SCHEMA, getDrizzleInstance, eq, desc, asc, and } from '@hc/db';
import { Effect } from 'effect';
import { TaggedError } from 'effect/Data';
import { env } from '$env/dynamic/private';

export class DbError extends TaggedError('DbError') {
	constructor(message: string, options?: { cause?: unknown }) {
		super();
		this.message = message;
		this.cause = options?.cause;
	}
}

export type VideoFilter = 'videos' | 'shorts' | 'livestreams';
export type VideoSort = 'latest' | 'most_viewed' | 'most_liked' | 'oldest';

const dbService = Effect.gen(function* () {
	const dbUrl = yield* Effect.sync(() => env.MYSQL_URL);

	if (!dbUrl) {
		return yield* Effect.die('MYSQL_URL is not set...');
	}

	const drizzle = yield* Effect.acquireRelease(
		Effect.try(() => getDrizzleInstance(dbUrl)),
		(db) =>
			Effect.sync(() => {
				console.log('Releasing database connection...');
				db.$client.end();
			})
	).pipe(
		Effect.catchAll((err) => {
			console.error('Failed to connect to database...', err);
			return Effect.die('Failed to connect to database...');
		})
	);

	const getSidebarChannels = () =>
		Effect.gen(function* () {
			const channels = yield* Effect.tryPromise({
				try: () =>
					drizzle
						.select({
							name: DB_SCHEMA.channels.name,
							handle: DB_SCHEMA.channels.handle,
							thumbnailUrl: DB_SCHEMA.channels.thumbnailUrl
						})
						.from(DB_SCHEMA.channels)
						.orderBy(DB_SCHEMA.channels.name),
				catch: (err) =>
					new DbError('Failed to get sidebar channels', {
						cause: err
					})
			});
			return channels;
		});

	const getChannelByHandle = (handle: string) =>
		Effect.gen(function* () {
			const channels = yield* Effect.tryPromise({
				try: () =>
					drizzle
						.select({
							ytChannelId: DB_SCHEMA.channels.ytChannelId,
							name: DB_SCHEMA.channels.name,
							handle: DB_SCHEMA.channels.handle,
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
				catch: (err) =>
					new DbError('Failed to get channel by handle', {
						cause: err
					})
			});

			if (!channels[0]) {
				return yield* Effect.fail(
					new DbError('Channel not found', {
						cause: new Error('Channel not found')
					})
				);
			}

			return channels[0];
		});

	const getChannelVideos = (
		ytChannelId: string,
		limit: number,
		offset: number,
		filter: VideoFilter,
		sort: VideoSort = 'latest'
	) =>
		Effect.gen(function* () {
			const videos = yield* Effect.tryPromise({
				try: () =>
					drizzle
						.select({
							ytVideoId: DB_SCHEMA.videos.ytVideoId,
							title: DB_SCHEMA.videos.title,
							thumbnailUrl: DB_SCHEMA.videos.thumbnailUrl,
							publishedAt: DB_SCHEMA.videos.publishedAt,
							viewCount: DB_SCHEMA.videos.viewCount,
							likeCount: DB_SCHEMA.videos.likeCount,
							commentCount: DB_SCHEMA.videos.commentCount,
							duration: DB_SCHEMA.videos.duration,
							isLiveStream: DB_SCHEMA.videos.isLiveStream,
							isShort: DB_SCHEMA.videos.isShort
						})
						.from(DB_SCHEMA.videos)
						.where(() => {
							if (filter === 'livestreams') {
								return and(
									eq(DB_SCHEMA.videos.ytChannelId, ytChannelId),
									eq(DB_SCHEMA.videos.isLiveStream, true)
								);
							} else if (filter === 'shorts') {
								return and(
									eq(DB_SCHEMA.videos.ytChannelId, ytChannelId),
									eq(DB_SCHEMA.videos.isShort, true)
								);
							} else {
								return eq(DB_SCHEMA.videos.ytChannelId, ytChannelId);
							}
						})
						.orderBy(() => {
							switch (sort) {
								case 'most_viewed':
									return desc(DB_SCHEMA.videos.viewCount);
								case 'most_liked':
									return desc(DB_SCHEMA.videos.likeCount);
								case 'oldest':
									return asc(DB_SCHEMA.videos.publishedAt);
								case 'latest':
								default:
									return desc(DB_SCHEMA.videos.publishedAt);
							}
						})
						.limit(limit)
						.offset(offset),
				catch: (err) =>
					new DbError('Failed to get channel videos', {
						cause: err
					})
			});
			return videos;
		});

	const getAllVideos = (
		limit: number,
		offset: number,
		filter: VideoFilter,
		sort: VideoSort = 'latest'
	) =>
		Effect.gen(function* () {
			const videos = yield* Effect.tryPromise({
				try: () =>
					drizzle
						.select({
							ytVideoId: DB_SCHEMA.videos.ytVideoId,
							title: DB_SCHEMA.videos.title,
							thumbnailUrl: DB_SCHEMA.videos.thumbnailUrl,
							publishedAt: DB_SCHEMA.videos.publishedAt,
							viewCount: DB_SCHEMA.videos.viewCount,
							likeCount: DB_SCHEMA.videos.likeCount,
							commentCount: DB_SCHEMA.videos.commentCount,
							duration: DB_SCHEMA.videos.duration,
							isLiveStream: DB_SCHEMA.videos.isLiveStream,
							isShort: DB_SCHEMA.videos.isShort,
							channelName: DB_SCHEMA.channels.name,
							channelThumbnailUrl: DB_SCHEMA.channels.thumbnailUrl,
							channelHandle: DB_SCHEMA.channels.handle
						})
						.from(DB_SCHEMA.videos)
						.innerJoin(
							DB_SCHEMA.channels,
							eq(DB_SCHEMA.videos.ytChannelId, DB_SCHEMA.channels.ytChannelId)
						)
						.where(() => {
							if (filter === 'livestreams') {
								return eq(DB_SCHEMA.videos.isLiveStream, true);
							} else if (filter === 'shorts') {
								return eq(DB_SCHEMA.videos.isShort, true);
							} else {
								return undefined;
							}
						})
						.orderBy(() => {
							switch (sort) {
								case 'most_viewed':
									return desc(DB_SCHEMA.videos.viewCount);
								case 'most_liked':
									return desc(DB_SCHEMA.videos.likeCount);
								case 'oldest':
									return asc(DB_SCHEMA.videos.publishedAt);
								case 'latest':
								default:
									return desc(DB_SCHEMA.videos.publishedAt);
							}
						})
						.limit(limit)
						.offset(offset),
				catch: (err) =>
					new DbError('Failed to get all videos', {
						cause: err
					})
			});
			return videos;
		});

	return {
		getSidebarChannels,
		getChannelByHandle,
		getChannelVideos,
		getAllVideos
	};
});

export class DbService extends Effect.Service<DbService>()('DbService', {
	scoped: dbService
}) {}
