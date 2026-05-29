import { env } from '$env/dynamic/private';
import { DB_SCHEMA, type Video } from '@hc/db/schema';
import * as Context from 'effect/Context';
import * as Data from 'effect/Data';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { CacheService } from './cache';
import {
	buildVideoFeedWhere,
	getVideoFeedOrderBy,
	videoSelect,
	videoSelectWithCreator
} from './video-query';
import type { VideoFilter, VideoSort } from '$lib/components/video-feed/contract';

export class DbError extends Data.TaggedError('DbError')<{
	message: string;
	cause?: unknown;
}> {}

const CACHE_TTL = {
	SIDEBAR_CREATORS: 120,
	CREATOR_DETAILS: 120,
	CREATOR_VIDEOS: 120,
	ALL_VIDEOS: 120
} as const;

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
			try: () => drizzle({ client: new Pool({ connectionString: dbUrl }) }),
			catch: (cause) =>
				new DbError({
					message: 'Failed to connect to database...',
					cause
				})
		}),
		(db) =>
			Effect.gen(function* () {
				yield* Effect.log('Releasing database connection...');
				yield* Effect.promise(() => db.$client.end());
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
				buildVideoFeedWhere(
					'livestreams',
					false,
					inArray(DB_SCHEMA.videos.ytChannelId, ytChannelIds),
					eq(DB_SCHEMA.videos.livestreamType, 'live')
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

	const getSidebarCreatorsWithLiveStatus = cache.getOrSet(
		'sidebar:creators-with-live-status',
		Effect.tryPromise({
			try: async () => {
				const creators = await drizzleDb
					.select({
						ytChannelId: DB_SCHEMA.creators.ytChannelId,
						ytName: DB_SCHEMA.creators.ytName,
						ytHandle: DB_SCHEMA.creators.ytHandle,
						ytAvatarUrl: DB_SCHEMA.creators.ytAvatarUrl,
						twitchUserLogin: DB_SCHEMA.creators.twitchUserLogin,
						isTwitchLive: DB_SCHEMA.creators.isTwitchLive
					})
					.from(DB_SCHEMA.creators)
					.orderBy(DB_SCHEMA.creators.ytName);

				const ytLiveVideoIdsByChannelId = await getCurrentYtLiveVideoIdsByChannelId(
					creators.map((creator) => creator.ytChannelId)
				);

				return creators.map((creator) => ({
					...creator,
					ytLiveVideoId: ytLiveVideoIdsByChannelId.get(creator.ytChannelId) ?? null
				}));
			},
			catch: (cause) =>
				new DbError({
					message: 'Failed to get sidebar creators',
					cause
				})
		}).pipe(Effect.orDie),
		CACHE_TTL.SIDEBAR_CREATORS
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
		onlyHermitCraft = false
	) =>
		cache.getOrSet(
			`videos:creator:${ytChannelId}:${filter}:${sort}:${onlyHermitCraft}:${limit}:${offset}`,
			Effect.tryPromise({
				try: () =>
					drizzleDb
						.select(videoSelect)
						.from(DB_SCHEMA.videos)
						.where(
							buildVideoFeedWhere(
								filter,
								onlyHermitCraft,
								eq(DB_SCHEMA.videos.ytChannelId, ytChannelId)
							)
						)
						.orderBy(getVideoFeedOrderBy(sort))
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
		onlyHermitCraft = false
	) =>
		cache.getOrSet(
			`videos:all:${filter}:${sort}:${onlyHermitCraft}:${limit}:${offset}`,
			Effect.tryPromise({
				try: () =>
					drizzleDb
						.select(videoSelectWithCreator)
						.from(DB_SCHEMA.videos)
						.innerJoin(
							DB_SCHEMA.creators,
							eq(DB_SCHEMA.videos.ytChannelId, DB_SCHEMA.creators.ytChannelId)
						)
						.where(buildVideoFeedWhere(filter, onlyHermitCraft))
						.orderBy(getVideoFeedOrderBy(sort))
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
		getSidebarCreatorsWithLiveStatus,
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
