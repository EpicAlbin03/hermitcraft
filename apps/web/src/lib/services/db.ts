import { env } from '$env/dynamic/private';
import { DB_SCHEMA } from '@hc/db/schema';
import * as Context from 'effect/Context';
import * as Data from 'effect/Data';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { and, asc, desc, eq, inArray, like, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { CacheService } from './cache';

export class DbError extends Data.TaggedError('DbError')<{
	message: string;
	cause?: unknown;
}> {}

// Cache TTL constants (in seconds)
// Sync frequencies: Channels daily, Old videos daily, Recent videos/Twitch/YT live every 2 min
const CACHE_TTL = {
	SIDEBAR_CHANNELS: 3600, // Channel list (synced daily) - 1 hour
	LIVE_STATUS: 120, // Twitch & YT live status (synced every 2 min)
	CHANNEL_DETAILS: 120, // Includes live status fields (synced every 2 min)
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

	const drizzleDb = yield* Effect.acquireRelease(
		Effect.try({
			try: () => {
				const pool = new Pool({ connectionString: dbUrl });
				return drizzle({ client: pool });
			},
			catch: (cause) =>
				new DbError({
					message: 'Failed to connect to database...',
					cause
				})
		}),
		(db) =>
			Effect.gen(function* () {
				yield* Effect.log('Releasing database connection...');
				const pool = db.$client;
				yield* Effect.promise(() => pool.end());
			})
	).pipe(
		Effect.catchTag('DbError', (error) =>
			Effect.logError(error).pipe(Effect.andThen(Effect.die(error.message)))
		)
	);

	const getSidebarChannels = () =>
		cache.getOrSet(
			'sidebar:channels',
			Effect.tryPromise({
				try: () =>
					drizzleDb
						.select({
							ytName: DB_SCHEMA.channels.ytName,
							ytHandle: DB_SCHEMA.channels.ytHandle,
							ytAvatarUrl: DB_SCHEMA.channels.ytAvatarUrl,
							twitchUserLogin: DB_SCHEMA.channels.twitchUserLogin
						})
						.from(DB_SCHEMA.channels)
						.orderBy(DB_SCHEMA.channels.ytName),
				catch: (cause) =>
					new DbError({
						message: 'Failed to get sidebar channels',
						cause
					})
			}).pipe(Effect.orDie),
			CACHE_TTL.SIDEBAR_CHANNELS
		);

	const getLiveStatus = () =>
		cache.getOrSet(
			'live:status',
			Effect.tryPromise({
				try: async () => {
					const liveData = await drizzleDb
						.select({
							ytHandle: DB_SCHEMA.channels.ytHandle,
							isTwitchLive: DB_SCHEMA.channels.isTwitchLive,
							ytLiveVideoId: sql<string | null>`null`
						})
						.from(DB_SCHEMA.channels);

					return Object.fromEntries(
						liveData.map((c) => [
							c.ytHandle,
							{ isTwitchLive: c.isTwitchLive, ytLiveVideoId: c.ytLiveVideoId }
						])
					);
				},
				catch: (cause) =>
					new DbError({
						message: 'Failed to get live status',
						cause
					})
			}).pipe(Effect.orDie),
			CACHE_TTL.LIVE_STATUS
		);

	const getChannelByHandle = (handle: string) =>
		cache.getOrSet(
			`channel:${handle}`,
			Effect.tryPromise({
				try: async () => {
					const channels = await drizzleDb
						.select({
							ytChannelId: DB_SCHEMA.channels.ytChannelId,
							ytName: DB_SCHEMA.channels.ytName,
							ytHandle: DB_SCHEMA.channels.ytHandle,
							ytAvatarUrl: DB_SCHEMA.channels.ytAvatarUrl,
							ytBannerUrl: DB_SCHEMA.channels.ytBannerUrl,
							ytBannerThumbHash: DB_SCHEMA.channels.ytBannerThumbHash,
							ytDescription: DB_SCHEMA.channels.ytDescription,
							ytViewCount: DB_SCHEMA.channels.ytViewCount,
							ytSubscriberCount: DB_SCHEMA.channels.ytSubscriberCount,
							ytVideoCount: DB_SCHEMA.channels.ytVideoCount,
							twitchUserLogin: DB_SCHEMA.channels.twitchUserLogin,
							isTwitchLive: DB_SCHEMA.channels.isTwitchLive,
							ytLiveVideoId: sql<string | null>`null`,
							links: DB_SCHEMA.channels.links
						})
						.from(DB_SCHEMA.channels)
						.where(eq(DB_SCHEMA.channels.ytHandle, handle))
						.limit(1);

					if (!channels[0]) {
						throw new DbError({
							message: 'Channel not found',
							cause: new Error('Channel not found')
						});
					}

					return channels[0];
				},
				catch: (cause) =>
					cause instanceof DbError
						? cause
						: new DbError({
								message: 'Failed to get channel by handle',
								cause
							})
			}).pipe(Effect.orDie),
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
			Effect.tryPromise({
				try: () =>
					drizzleDb
						.select({
							ytVideoId: DB_SCHEMA.videos.ytVideoId,
							title: DB_SCHEMA.videos.title,
							thumbnailUrl: DB_SCHEMA.videos.thumbnailUrl,
							publishedAt: DB_SCHEMA.videos.publishedAt,
							viewCount: DB_SCHEMA.videos.viewCount,
							likeCount: DB_SCHEMA.videos.likeCount,
							commentCount: DB_SCHEMA.videos.commentCount,
							duration: DB_SCHEMA.videos.durationSeconds,
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
				catch: (cause) =>
					new DbError({
						message: 'Failed to get channel videos',
						cause
					})
			}).pipe(Effect.orDie),
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
			Effect.tryPromise({
				try: () =>
					drizzleDb
						.select({
							ytVideoId: DB_SCHEMA.videos.ytVideoId,
							title: DB_SCHEMA.videos.title,
							thumbnailUrl: DB_SCHEMA.videos.thumbnailUrl,
							publishedAt: DB_SCHEMA.videos.publishedAt,
							viewCount: DB_SCHEMA.videos.viewCount,
							likeCount: DB_SCHEMA.videos.likeCount,
							commentCount: DB_SCHEMA.videos.commentCount,
							duration: DB_SCHEMA.videos.durationSeconds,
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
				catch: (cause) =>
					new DbError({
						message: 'Failed to get all videos',
						cause
					})
			}).pipe(Effect.orDie),
			CACHE_TTL.ALL_VIDEOS
		);

	return {
		getSidebarChannels,
		getLiveStatus,
		getChannelByHandle,
		getChannelVideos,
		getAllVideos
	} as const;
});

type DbServiceShape = Effect.Success<typeof dbService>;

export class DbService extends Context.Service<DbService, DbServiceShape>()(
	'web/lib/services/db/DbService',
	{
		make: dbService
	}
) {
	static readonly layer = Layer.effect(this, this.make);
}
