import { DB } from '@hc/db/connection';
import { DB_SCHEMA, type Creator, type Video } from '@hc/db/schema';
import * as Option from 'effect/Option';
import * as Effect from 'effect/Effect';
import * as Context from 'effect/Context';
import * as Data from 'effect/Data';
import * as Layer from 'effect/Layer';
import { and, eq, getColumns, inArray, sql } from 'drizzle-orm';

const getCurrentYtLiveVideoSortTime = (
	video: Pick<Video, 'livestreamActualStartTime' | 'livestreamScheduledStartTime' | 'publishedAt'>
) =>
	(
		video.livestreamActualStartTime ??
		video.livestreamScheduledStartTime ??
		video.publishedAt
	).getTime();

const chooseCurrentYtLiveVideoWinner = <
	T extends Pick<
		Video,
		'livestreamActualStartTime' | 'livestreamScheduledStartTime' | 'publishedAt'
	>
>(
	videos: T[]
) =>
	videos
		.toSorted((a, b) => getCurrentYtLiveVideoSortTime(b) - getCurrentYtLiveVideoSortTime(a))
		.at(0) ?? null;

export class DbError extends Data.TaggedError('DbError')<{ message: string; cause?: unknown }> {}

const {
	createdAt: creatorCreatedAt,
	modifiedAt: creatorModifiedAt,
	...creatorColumns
} = getColumns(DB_SCHEMA.creators);
const {
	createdAt: videoCreatedAt,
	modifiedAt: videoModifiedAt,
	...videoColumns
} = getColumns(DB_SCHEMA.videos);

const dbService = Effect.gen(function* () {
	const db = yield* DB;

	const getAllCreators = Effect.fn('getAllCreators')(function* () {
		return yield* db
			.select(creatorColumns)
			.from(DB_SCHEMA.creators)
			.pipe(
				Effect.mapError(
					(cause) =>
						new DbError({
							message: 'Failed to get all creators',
							cause
						})
				)
			);
	});

	const getCreator = Effect.fn('getCreator')(function* (ytChannelId: string) {
		return yield* db
			.select(creatorColumns)
			.from(DB_SCHEMA.creators)
			.where(eq(DB_SCHEMA.creators.ytChannelId, ytChannelId))
			.limit(1)
			.pipe(
				Effect.map(([creator]) => Option.fromNullishOr(creator)),
				Effect.mapError(
					(cause) =>
						new DbError({
							message: `Failed to get creator ${ytChannelId}`,
							cause
						})
				)
			);
	});

	const getCreators = Effect.fn('getCreators')(function* (ytChannelIds: string[]) {
		if (ytChannelIds.length === 0) return [];

		return yield* db
			.select(creatorColumns)
			.from(DB_SCHEMA.creators)
			.where(inArray(DB_SCHEMA.creators.ytChannelId, ytChannelIds))
			.pipe(
				Effect.mapError(
					(cause) =>
						new DbError({
							message: `Failed to get ${ytChannelIds.length} creators`,
							cause
						})
				)
			);
	});

	const getVideo = Effect.fn('getVideo')(function* (ytVideoId: string) {
		return yield* db
			.select(videoColumns)
			.from(DB_SCHEMA.videos)
			.where(eq(DB_SCHEMA.videos.ytVideoId, ytVideoId))
			.limit(1)
			.pipe(
				Effect.map(([video]) => Option.fromNullishOr(video)),
				Effect.mapError(
					(cause) => new DbError({ message: `Failed to get video ${ytVideoId}`, cause })
				)
			);
	});

	const getVideos = Effect.fn('getVideos')(function* (ytVideoIds: string[]) {
		if (ytVideoIds.length === 0) return [];

		return yield* db
			.select(videoColumns)
			.from(DB_SCHEMA.videos)
			.where(inArray(DB_SCHEMA.videos.ytVideoId, ytVideoIds))
			.pipe(
				Effect.mapError(
					(cause) => new DbError({ message: `Failed to get ${ytVideoIds.length} videos`, cause })
				)
			);
	});

	const setCreatorTwitchLiveStatuses = Effect.fn('setCreatorTwitchLiveStatuses')(function* (
		updates: Array<{ ytChannelId: string; isTwitchLive: boolean }>
	) {
		if (updates.length === 0) return;

		return yield* db
			.transaction((tx) =>
				Effect.forEach(
					updates,
					(update) =>
						tx
							.update(DB_SCHEMA.creators)
							.set({ isTwitchLive: update.isTwitchLive })
							.where(eq(DB_SCHEMA.creators.ytChannelId, update.ytChannelId))
							.pipe(Effect.asVoid),
					{ concurrency: 'unbounded' }
				)
			)
			.pipe(
				Effect.asVoid,
				Effect.mapError(
					(cause) =>
						new DbError({
							message: `Failed to set Twitch live statuses for ${updates.length} creators`,
							cause
						})
				)
			);
	});

	const upsertCreator = Effect.fn('upsertCreator')(function* (data: Creator) {
		const [result] = yield* db
			.insert(DB_SCHEMA.creators)
			.values(data)
			.onConflictDoUpdate({
				target: DB_SCHEMA.creators.ytChannelId,
				set: {
					ytName: data.ytName,
					ytHandle: data.ytHandle,
					ytDescription: data.ytDescription,
					ytAvatarUrl: data.ytAvatarUrl,
					ytBannerUrl: data.ytBannerUrl,
					ytBannerThumbHash: data.ytBannerThumbHash,
					ytViewCount: data.ytViewCount,
					ytSubscriberCount: data.ytSubscriberCount,
					ytVideoCount: data.ytVideoCount,
					twitchUserId: data.twitchUserId,
					twitchUserLogin: data.twitchUserLogin,
					isTwitchLive: data.isTwitchLive,
					links: data.links
				}
			})
			.returning({ wasInserted: sql<boolean>`xmax = 0` })
			.pipe(
				Effect.mapError(
					(cause) => new DbError({ message: `Failed to upsert creator ${data.ytChannelId}`, cause })
				)
			);

		return { ytChannelId: data.ytChannelId, wasInserted: result?.wasInserted ?? false };
	});

	const upsertVideo = Effect.fn('upsertVideo')(function* (data: Video) {
		const [result] = yield* db
			.insert(DB_SCHEMA.videos)
			.values(data)
			.onConflictDoUpdate({
				target: DB_SCHEMA.videos.ytVideoId,
				set: data
			})
			.returning({ wasInserted: sql<boolean>`xmax = 0` })
			.pipe(
				Effect.mapError(
					(cause) =>
						new DbError({
							message: `Failed to upsert video ${data.ytVideoId}`,
							cause
						})
				)
			);

		return {
			ytVideoId: data.ytVideoId,
			wasInserted: result?.wasInserted ?? false
		};
	});

	const deleteVideo = Effect.fn('deleteVideo')(function* (ytVideoId: string) {
		return yield* db
			.delete(DB_SCHEMA.videos)
			.where(eq(DB_SCHEMA.videos.ytVideoId, ytVideoId))
			.pipe(
				Effect.mapError(
					(cause) => new DbError({ message: `Failed to delete video ${ytVideoId}`, cause })
				)
			);
	});

	const markVideosAsPrivate = Effect.fn('markVideosAsPrivate')(function* (ytVideoIds: string[]) {
		if (ytVideoIds.length === 0) return 0;

		const result = yield* db
			.transaction((tx) =>
				Effect.gen(function* () {
					const updatedVideos = yield* tx
						.update(DB_SCHEMA.videos)
						.set({ privacyStatus: 'private' })
						.where(inArray(DB_SCHEMA.videos.ytVideoId, ytVideoIds))
						.returning({ ytVideoId: DB_SCHEMA.videos.ytVideoId });

					yield* tx
						.update(DB_SCHEMA.videos)
						.set({ livestreamType: 'completed' })
						.where(
							and(
								inArray(DB_SCHEMA.videos.ytVideoId, ytVideoIds),
								eq(DB_SCHEMA.videos.livestreamType, 'live')
							)
						);

					return updatedVideos;
				})
			)
			.pipe(
				Effect.mapError(
					(cause) =>
						new DbError({
							message: `Failed to mark ${ytVideoIds.length} videos as private`,
							cause
						})
				)
			);

		return result.length;
	});

	const getCurrentYtLiveVideosByCreators = Effect.fn('getCurrentYtLiveVideosByCreators')(function* (
		ytChannelIds: string[]
	) {
		if (ytChannelIds.length === 0) return [];

		const liveVideos = yield* db
			.select(videoColumns)
			.from(DB_SCHEMA.videos)
			.where(
				and(
					inArray(DB_SCHEMA.videos.ytChannelId, ytChannelIds),
					eq(DB_SCHEMA.videos.livestreamType, 'live'),
					eq(DB_SCHEMA.videos.privacyStatus, 'public')
				)
			)
			.pipe(
				Effect.mapError(
					(cause) =>
						new DbError({
							message: `Failed to get current YT live videos for ${ytChannelIds.length} creators`,
							cause
						})
				)
			);

		const liveVideosByChannel = new Map<string, Video[]>();

		for (const liveVideo of liveVideos) {
			const existingVideos = liveVideosByChannel.get(liveVideo.ytChannelId) ?? [];
			existingVideos.push(liveVideo);
			liveVideosByChannel.set(liveVideo.ytChannelId, existingVideos);
		}

		return ytChannelIds.flatMap((ytChannelId) => {
			const winner = chooseCurrentYtLiveVideoWinner(liveVideosByChannel.get(ytChannelId) ?? []);
			return winner ? [winner] : [];
		});
	});

	const deleteCreator = Effect.fn('deleteCreator')(function* (ytChannelId: string) {
		return yield* db
			.delete(DB_SCHEMA.creators)
			.where(eq(DB_SCHEMA.creators.ytChannelId, ytChannelId))
			.pipe(
				Effect.mapError(
					(cause) => new DbError({ message: `Failed to delete creator ${ytChannelId}`, cause })
				)
			);
	});

	const deleteAllVideos = Effect.fn('deleteAllVideos')(function* () {
		return yield* db
			.delete(DB_SCHEMA.videos)
			.pipe(
				Effect.mapError((cause) => new DbError({ message: `Failed to delete all videos`, cause }))
			);
	});

	const deleteAllCreators = Effect.fn('deleteAllCreators')(function* () {
		return yield* db
			.delete(DB_SCHEMA.creators)
			.pipe(
				Effect.mapError((cause) => new DbError({ message: `Failed to delete all creators`, cause }))
			);
	});

	return {
		getAllCreators,
		getCreator,
		getCreators,
		getVideo,
		getVideos,
		setCreatorTwitchLiveStatuses,
		upsertCreator,
		upsertVideo,
		deleteVideo,
		deleteCreator,
		deleteAllVideos,
		deleteAllCreators,
		markVideosAsPrivate,
		getCurrentYtLiveVideosByCreators
	} as const;
});

type DbServiceShape = Effect.Success<typeof dbService>;

export class DbService extends Context.Service<DbService, DbServiceShape>()(
	'@hc/content-sync/db-service/DbService',
	{ make: dbService }
) {
	static readonly layer = Layer.effect(this, this.make);
}
