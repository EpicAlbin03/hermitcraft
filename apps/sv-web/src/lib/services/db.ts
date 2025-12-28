import { DB_SCHEMA, getDrizzleInstance, eq, desc, asc, and, like, inArray } from '@hc/db';
import { Effect } from 'effect';
import { TaggedError } from 'effect/Data';
import { env } from '$env/dynamic/private';
import { CacheService } from './cache';

export class DbError extends TaggedError('DbError') {
	constructor(message: string, options?: { cause?: unknown }) {
		super();
		this.message = message;
		this.cause = options?.cause;
	}
}

// Cache TTL constants (in seconds)
// Sync frequencies: Channels daily, Old videos daily, Recent videos/Twitch/YT live every 2 min
const CACHE_TTL = {
	SIDEBAR_CHANNELS: 3600, // Channel list (synced daily) - 1 hour
	LIVE_STATUS: 120, // Twitch & YT live status (synced every 2 min)
	CHANNEL_DETAILS: 3600, // Channel details (synced daily) - 1 hour
	CHANNEL_VIDEOS: 120, // Videos synced every 2 min
	ALL_VIDEOS: 120 // Videos synced every 2 min
} as const;

export type VideoFilter = 'videos' | 'shorts' | 'livestreams';
export type VideoSort = 'latest' | 'most_viewed' | 'most_liked' | 'oldest';

const dbService = Effect.gen(function* () {
	const dbUrl = yield* Effect.sync(() => env.MYSQL_URL);
	const cache = yield* CacheService;

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
		cache.getOrSet(
			'sidebar:channels',
			Effect.gen(function* () {
				const channels = yield* Effect.tryPromise({
					try: () =>
						drizzle
							.select({
								ytName: DB_SCHEMA.channels.ytName,
								ytHandle: DB_SCHEMA.channels.ytHandle,
								ytAvatarUrl: DB_SCHEMA.channels.ytAvatarUrl,
								twitchUserLogin: DB_SCHEMA.channels.twitchUserLogin
							})
							.from(DB_SCHEMA.channels)
							.orderBy(DB_SCHEMA.channels.ytName),
					catch: (err) =>
						new DbError('Failed to get sidebar channels', {
							cause: err
						})
				});
				return channels;
			}),
			CACHE_TTL.SIDEBAR_CHANNELS
		);

	const getLiveStatus = () =>
		cache.getOrSet(
			'live:status',
			Effect.gen(function* () {
				const liveData = yield* Effect.tryPromise({
					try: () =>
						drizzle
							.select({
								ytHandle: DB_SCHEMA.channels.ytHandle,
								isTwitchLive: DB_SCHEMA.channels.isTwitchLive,
								ytLiveVideoId: DB_SCHEMA.channels.ytLiveVideoId
							})
							.from(DB_SCHEMA.channels),
					catch: (err) =>
						new DbError('Failed to get live status', {
							cause: err
						})
				});
				return Object.fromEntries(
					liveData.map((c) => [
						c.ytHandle,
						{ isTwitchLive: c.isTwitchLive, ytLiveVideoId: c.ytLiveVideoId }
					])
				);
			}),
			CACHE_TTL.LIVE_STATUS
		);

	const getChannelByHandle = (handle: string) =>
		cache.getOrSet(
			`channel:${handle}`,
			Effect.gen(function* () {
				const channels = yield* Effect.tryPromise({
					try: () =>
						drizzle
							.select({
								ytChannelId: DB_SCHEMA.channels.ytChannelId,
								ytName: DB_SCHEMA.channels.ytName,
								ytHandle: DB_SCHEMA.channels.ytHandle,
								ytAvatarUrl: DB_SCHEMA.channels.ytAvatarUrl,
								ytBannerUrl: DB_SCHEMA.channels.ytBannerUrl,
								ytDescription: DB_SCHEMA.channels.ytDescription,
								ytViewCount: DB_SCHEMA.channels.ytViewCount,
								ytSubscriberCount: DB_SCHEMA.channels.ytSubscriberCount,
								ytVideoCount: DB_SCHEMA.channels.ytVideoCount,
								twitchUserLogin: DB_SCHEMA.channels.twitchUserLogin,
								links: DB_SCHEMA.channels.links
							})
							.from(DB_SCHEMA.channels)
							.where(eq(DB_SCHEMA.channels.ytHandle, handle))
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
			}),
			CACHE_TTL.CHANNEL_DETAILS
		);

	const getChannelVideos = (
		ytChannelId: string,
		limit: number,
		offset: number,
		filter: VideoFilter,
		sort: VideoSort = 'latest',
		onlyHermitCraft: boolean = false
	) =>
		cache.getOrSet(
			`videos:channel:${ytChannelId}:${filter}:${sort}:${onlyHermitCraft}:${limit}:${offset}`,
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
								isShort: DB_SCHEMA.videos.isShort,
								livestreamType: DB_SCHEMA.videos.livestreamType,
								livestreamScheduledStartTime: DB_SCHEMA.videos.livestreamScheduledStartTime,
								livestreamActualStartTime: DB_SCHEMA.videos.livestreamActualStartTime,
								livestreamConcurrentViewers: DB_SCHEMA.videos.livestreamConcurrentViewers
							})
							.from(DB_SCHEMA.videos)
							.where(() => {
								const conditions = [
									inArray(DB_SCHEMA.videos.uploadStatus, ['uploaded', 'processed']),
									eq(DB_SCHEMA.videos.privacyStatus, 'public')
								];

								if (onlyHermitCraft) {
									conditions.push(like(DB_SCHEMA.videos.title, '%hermitcraft%'));
								}

								if (filter === 'livestreams') {
									return and(
										eq(DB_SCHEMA.videos.ytChannelId, ytChannelId),
										inArray(DB_SCHEMA.videos.livestreamType, ['live', 'upcoming', 'completed']),
										...conditions
									);
								} else if (filter === 'shorts') {
									return and(
										eq(DB_SCHEMA.videos.ytChannelId, ytChannelId),
										eq(DB_SCHEMA.videos.isShort, true),
										...conditions
									);
								} else {
									return and(
										eq(DB_SCHEMA.videos.ytChannelId, ytChannelId),
										eq(DB_SCHEMA.videos.livestreamType, 'none'),
										eq(DB_SCHEMA.videos.isShort, false),
										...conditions
									);
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
			}),
			CACHE_TTL.CHANNEL_VIDEOS
		);

	const getAllVideos = (
		limit: number,
		offset: number,
		filter: VideoFilter,
		sort: VideoSort = 'latest',
		onlyHermitCraft: boolean = false
	) =>
		cache.getOrSet(
			`videos:all:${filter}:${sort}:${onlyHermitCraft}:${limit}:${offset}`,
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
								isShort: DB_SCHEMA.videos.isShort,
								livestreamType: DB_SCHEMA.videos.livestreamType,
								livestreamScheduledStartTime: DB_SCHEMA.videos.livestreamScheduledStartTime,
								livestreamActualStartTime: DB_SCHEMA.videos.livestreamActualStartTime,
								livestreamConcurrentViewers: DB_SCHEMA.videos.livestreamConcurrentViewers,
								channelName: DB_SCHEMA.channels.ytName,
								channelAvatarUrl: DB_SCHEMA.channels.ytAvatarUrl,
								channelHandle: DB_SCHEMA.channels.ytHandle
							})
							.from(DB_SCHEMA.videos)
							.innerJoin(
								DB_SCHEMA.channels,
								eq(DB_SCHEMA.videos.ytChannelId, DB_SCHEMA.channels.ytChannelId)
							)
							.where(() => {
								const conditions = [
									inArray(DB_SCHEMA.videos.uploadStatus, ['uploaded', 'processed']),
									eq(DB_SCHEMA.videos.privacyStatus, 'public')
								];

								if (onlyHermitCraft) {
									conditions.push(like(DB_SCHEMA.videos.title, '%hermitcraft%'));
								}

								if (filter === 'livestreams') {
									return and(
										inArray(DB_SCHEMA.videos.livestreamType, ['live', 'upcoming', 'completed']),
										...conditions
									);
								} else if (filter === 'shorts') {
									return and(eq(DB_SCHEMA.videos.isShort, true), ...conditions);
								} else {
									return and(
										eq(DB_SCHEMA.videos.livestreamType, 'none'),
										eq(DB_SCHEMA.videos.isShort, false),
										...conditions
									);
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
			}),
			CACHE_TTL.ALL_VIDEOS
		);

	return {
		getSidebarChannels,
		getLiveStatus,
		getChannelByHandle,
		getChannelVideos,
		getAllVideos
	};
});

export class DbService extends Effect.Service<DbService>()('DbService', {
	scoped: dbService,
	dependencies: [CacheService.Default]
}) {}
