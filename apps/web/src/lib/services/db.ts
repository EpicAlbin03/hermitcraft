import { env } from '$env/dynamic/private';
import { DB_SCHEMA, type Video } from '@hc/db/schema';
import * as Context from 'effect/Context';
import * as Data from 'effect/Data';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { and, asc, desc, eq, inArray, like } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { CacheService } from './cache';

export class DbError extends Data.TaggedError('DbError')<{
	message: string;
	cause?: unknown;
}> {}

// Cache TTL constants (in seconds)
// Sync frequencies: Creators daily, old videos daily, recent videos/Twitch/YT live every 2 min
const CACHE_TTL = {
	SIDEBAR_CREATORS: 3600, // Creator list (synced daily) - 1 hour
	LIVE_STATUS: 120, // Twitch & YT live status (synced every 2 min)
	CREATOR_DETAILS: 120, // Includes live status fields (synced every 2 min)
	CREATOR_VIDEOS: 120, // Videos synced every 2 min
	ALL_VIDEOS: 120 // Videos synced every 2 min
} as const;

export type VideoFilter = 'videos' | 'shorts' | 'livestreams';
export type VideoSort = 'latest' | 'most_viewed' | 'most_liked' | 'oldest';

const getCurrentYtLiveVideoSortTime = (
	video: Pick<Video, 'livestreamActualStartTime' | 'livestreamScheduledStartTime' | 'publishedAt'>
) =>
	(
		video.livestreamActualStartTime ??
		video.livestreamScheduledStartTime ??
		video.publishedAt
	).getTime();

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

	const getCurrentYtLiveVideoIdsByChannelId = async (ytChannelIds: string[]) => {
		if (ytChannelIds.length === 0) {
			return new Map<string, string>();
		}

		const liveVideos = await drizzleDb
			.select({
				ytChannelId: DB_SCHEMA.videos.ytChannelId,
				ytVideoId: DB_SCHEMA.videos.ytVideoId,
				publishedAt: DB_SCHEMA.videos.publishedAt,
				livestreamScheduledStartTime: DB_SCHEMA.videos.livestreamScheduledStartTime,
				livestreamActualStartTime: DB_SCHEMA.videos.livestreamActualStartTime
			})
			.from(DB_SCHEMA.videos)
			.where(
				and(
					inArray(DB_SCHEMA.videos.ytChannelId, ytChannelIds),
					eq(DB_SCHEMA.videos.livestreamType, 'live'),
					eq(DB_SCHEMA.videos.privacyStatus, 'public'),
					inArray(DB_SCHEMA.videos.uploadStatus, ['uploaded', 'processed'])
				)
			);

		const winnersByChannelId = new Map<string, (typeof liveVideos)[number]>();

		for (const liveVideo of liveVideos) {
			const currentWinner = winnersByChannelId.get(liveVideo.ytChannelId);
			if (
				!currentWinner ||
				getCurrentYtLiveVideoSortTime(liveVideo) > getCurrentYtLiveVideoSortTime(currentWinner)
			) {
				winnersByChannelId.set(liveVideo.ytChannelId, liveVideo);
			}
		}

		return new Map(
			Array.from(winnersByChannelId.entries(), ([ytChannelId, liveVideo]) => [
				ytChannelId,
				liveVideo.ytVideoId
			])
		);
	};

	const getSidebarCreators = cache.getOrSet(
		'sidebar:creators',
		Effect.tryPromise({
			try: () =>
				drizzleDb
					.select({
						ytName: DB_SCHEMA.creators.ytName,
						ytHandle: DB_SCHEMA.creators.ytHandle,
						ytAvatarUrl: DB_SCHEMA.creators.ytAvatarUrl,
						twitchUserLogin: DB_SCHEMA.creators.twitchUserLogin
					})
					.from(DB_SCHEMA.creators)
					.orderBy(DB_SCHEMA.creators.ytName),
			catch: (cause) =>
				new DbError({
					message: 'Failed to get sidebar creators',
					cause
				})
		}).pipe(Effect.orDie),
		CACHE_TTL.SIDEBAR_CREATORS
	);

	const getLiveStatus = cache.getOrSet(
		'live:status',
		Effect.tryPromise({
			try: async () => {
				const creators = await drizzleDb
					.select({
						ytChannelId: DB_SCHEMA.creators.ytChannelId,
						ytHandle: DB_SCHEMA.creators.ytHandle,
						isTwitchLive: DB_SCHEMA.creators.isTwitchLive
					})
					.from(DB_SCHEMA.creators);
				const ytLiveVideoIdsByChannelId = await getCurrentYtLiveVideoIdsByChannelId(
					creators.map((creator) => creator.ytChannelId)
				);

				return Object.fromEntries(
					creators.map((creator) => [
						creator.ytHandle,
						{
							isTwitchLive: creator.isTwitchLive,
							ytLiveVideoId: ytLiveVideoIdsByChannelId.get(creator.ytChannelId) ?? null
						}
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

	const getCreatorByHandle = (handle: string) =>
		cache.getOrSet(
			`creator:${handle}`,
			Effect.tryPromise({
				try: async () => {
					const creators = await drizzleDb
						.select({
							ytChannelId: DB_SCHEMA.creators.ytChannelId,
							ytName: DB_SCHEMA.creators.ytName,
							ytHandle: DB_SCHEMA.creators.ytHandle,
							ytAvatarUrl: DB_SCHEMA.creators.ytAvatarUrl,
							ytBannerUrl: DB_SCHEMA.creators.ytBannerUrl,
							ytBannerThumbHash: DB_SCHEMA.creators.ytBannerThumbHash,
							ytDescription: DB_SCHEMA.creators.ytDescription,
							ytViewCount: DB_SCHEMA.creators.ytViewCount,
							ytSubscriberCount: DB_SCHEMA.creators.ytSubscriberCount,
							ytVideoCount: DB_SCHEMA.creators.ytVideoCount,
							twitchUserLogin: DB_SCHEMA.creators.twitchUserLogin,
							isTwitchLive: DB_SCHEMA.creators.isTwitchLive,
							links: DB_SCHEMA.creators.links
						})
						.from(DB_SCHEMA.creators)
						.where(eq(DB_SCHEMA.creators.ytHandle, handle))
						.limit(1);

					const creator = creators[0];
					if (!creator) {
						throw new DbError({
							message: 'Creator not found',
							cause: new Error('Creator not found')
						});
					}

					const ytLiveVideoIdsByChannelId = await getCurrentYtLiveVideoIdsByChannelId([
						creator.ytChannelId
					]);

					return {
						...creator,
						ytLiveVideoId: ytLiveVideoIdsByChannelId.get(creator.ytChannelId) ?? null
					};
				},
				catch: (cause) =>
					cause instanceof DbError
						? cause
						: new DbError({
								message: 'Failed to get creator by handle',
								cause
							})
			}).pipe(Effect.orDie),
			CACHE_TTL.CREATOR_DETAILS
		);

	const getCreatorVideos = (
		ytChannelId: string,
		limit: number,
		offset: number,
		filter: VideoFilter,
		sort: VideoSort = 'latest',
		onlyHermitCraft: boolean = false
	) =>
		cache.getOrSet(
			`videos:creator:${ytChannelId}:${filter}:${sort}:${onlyHermitCraft}:${limit}:${offset}`,
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
						message: 'Failed to get creator videos',
						cause
					})
			}).pipe(Effect.orDie),
			CACHE_TTL.CREATOR_VIDEOS
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
							creatorName: DB_SCHEMA.creators.ytName,
							creatorAvatarUrl: DB_SCHEMA.creators.ytAvatarUrl,
							creatorHandle: DB_SCHEMA.creators.ytHandle
						})
						.from(DB_SCHEMA.videos)
						.innerJoin(
							DB_SCHEMA.creators,
							eq(DB_SCHEMA.videos.ytChannelId, DB_SCHEMA.creators.ytChannelId)
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
		getSidebarCreators,
		getLiveStatus,
		getCreatorByHandle,
		getCreatorVideos,
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
