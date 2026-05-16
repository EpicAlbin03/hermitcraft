import { DB } from '@hc/db/connection';
import { DB_SCHEMA, type Channel, type Video } from '@hc/db/schema';
import * as Option from 'effect/Option';
import * as Effect from 'effect/Effect';
import * as Context from 'effect/Context';
import * as Data from 'effect/Data';
import * as Console from 'effect/Console';
import { and, eq, getColumns, inArray, sql } from 'drizzle-orm';

// TODO: move this
function parseIsoDurationToSeconds(duration: string): number | null {
	const ISO_DURATION_PATTERN = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;
	const match = ISO_DURATION_PATTERN.exec(duration);
	if (!match) return null;

	const days = Number.parseInt(match[1] ?? '0', 10);
	const hours = Number.parseInt(match[2] ?? '0', 10);
	const minutes = Number.parseInt(match[3] ?? '0', 10);
	const seconds = Number.parseInt(match[4] ?? '0', 10);

	const totalSeconds = ((days * 24 + hours) * 60 + minutes) * 60 + seconds;
	return Number.isNaN(totalSeconds) ? null : totalSeconds;
}

class DbError extends Data.TaggedError('DbError')<{ message: string; cause?: unknown }> {}

const {
	createdAt: channelCreatedAt,
	modifiedAt: channelModifiedAt,
	...channelColumns
} = getColumns(DB_SCHEMA.channels);
const {
	createdAt: videoCreatedAt,
	modifiedAt: videoModifiedAt,
	...videoColumns
} = getColumns(DB_SCHEMA.videos);

const dbService = Effect.gen(function* () {
	const db = yield* DB;

	const getAllChannels = (): Effect.Effect<Channel[], DbError> =>
		db
			.select(channelColumns)
			.from(DB_SCHEMA.channels)
			.pipe(
				Effect.mapError(
					(cause) =>
						new DbError({
							message: 'Failed to get all channels',
							cause
						})
				)
			);

	const getChannel = (ytChannelId: string): Effect.Effect<Option.Option<Channel>, DbError> =>
		db
			.select(channelColumns)
			.from(DB_SCHEMA.channels)
			.where(eq(DB_SCHEMA.channels.ytChannelId, ytChannelId))
			.limit(1)
			.pipe(
				Effect.map(([channel]) => Option.fromNullishOr(channel)),
				Effect.mapError(
					(cause) =>
						new DbError({
							message: `Failed to get channel ${ytChannelId}`,
							cause
						})
				)
			);

	const getVideo = (ytVideoId: string): Effect.Effect<Option.Option<Video>, DbError> =>
		db
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

	const getVideos = (ytVideoIds: string[]): Effect.Effect<Video[], DbError> => {
		if (ytVideoIds.length === 0) return Effect.succeed([]);

		return db
			.select(videoColumns)
			.from(DB_SCHEMA.videos)
			.where(inArray(DB_SCHEMA.videos.ytVideoId, ytVideoIds))
			.pipe(
				Effect.mapError(
					(cause) => new DbError({ message: `Failed to get ${ytVideoIds.length} videos`, cause })
				)
			);
	};

	type ChannelUpdate = Pick<
		Channel,
		| 'ytName'
		| 'ytHandle'
		| 'ytDescription'
		| 'ytAvatarUrl'
		| 'ytBannerUrl'
		| 'ytBannerThumbHash'
		| 'ytViewCount'
		| 'ytSubscriberCount'
		| 'ytVideoCount'
		| 'twitchUserLogin'
		| 'links'
	>;

	const getChannelUpdate = (data: Channel): ChannelUpdate => ({
		ytName: data.ytName,
		ytHandle: data.ytHandle,
		ytDescription: data.ytDescription,
		ytAvatarUrl: data.ytAvatarUrl,
		ytBannerUrl: data.ytBannerUrl,
		ytBannerThumbHash: data.ytBannerThumbHash,
		ytViewCount: data.ytViewCount,
		ytSubscriberCount: data.ytSubscriberCount,
		ytVideoCount: data.ytVideoCount,
		twitchUserLogin: data.twitchUserLogin,
		links: data.links
	});

	const updateChannel = (ytChannelId: string, data: ChannelUpdate) =>
		db
			.update(DB_SCHEMA.channels)
			.set(data)
			.where(eq(DB_SCHEMA.channels.ytChannelId, ytChannelId))
			.pipe(
				Effect.asVoid,
				Effect.mapError(
					(cause) => new DbError({ message: `Failed to update channel ${ytChannelId}`, cause })
				)
			);

	const upsertChannel = Effect.fn('upsertChannel')(function* (data: Channel) {
		const [result] = yield* db
			.insert(DB_SCHEMA.channels)
			.values(data)
			.onConflictDoUpdate({
				target: DB_SCHEMA.channels.ytChannelId,
				set: getChannelUpdate(data)
			})
			.returning({ wasInserted: sql<boolean>`xmax = 0` })
			.pipe(
				Effect.mapError(
					(cause) => new DbError({ message: `Failed to upsert channel ${data.ytChannelId}`, cause })
				)
			);

		return { ytChannelId: data.ytChannelId, wasInserted: result?.wasInserted ?? false };
	});

	const upsertVideo = Effect.fn('upsertVideo')(function* (data: Video) {
		const durationSeconds = parseIsoDurationToSeconds(data.duration);

		const isLiveOrUpcoming = data.livestreamType === 'live' || data.livestreamType === 'upcoming';
		if ((durationSeconds === null || durationSeconds === 0) && !isLiveOrUpcoming) {
			yield* Console.warn(
				`\x1b[33mDuration is 0 or invalid for video ${data.ytVideoId}, skipping\x1b[0m`
			);
			return { ytVideoId: data.ytVideoId, wasInserted: false, wasSkipped: true };
		}

		const [result] = yield* db
			.transaction((tx) =>
				Effect.gen(function* () {
					const upsertResult = yield* tx
						.insert(DB_SCHEMA.videos)
						.values(data)
						.onConflictDoUpdate({
							target: DB_SCHEMA.videos.ytVideoId,
							set: data
						})
						.returning({ wasInserted: sql<boolean>`xmax = 0` });

					yield* tx
						.update(DB_SCHEMA.channels)
						.set({
							ytLiveVideoId: sql<string | null>`(
								select ${DB_SCHEMA.videos.ytVideoId}
								from ${DB_SCHEMA.videos}
								where ${DB_SCHEMA.videos.ytChannelId} = ${data.ytChannelId}
									and ${DB_SCHEMA.videos.livestreamType} = 'live'
									and ${DB_SCHEMA.videos.privacyStatus} = 'public'
								order by coalesce(
									${DB_SCHEMA.videos.livestreamActualStartTime},
									${DB_SCHEMA.videos.livestreamScheduledStartTime},
									${DB_SCHEMA.videos.publishedAt}
								) desc
								limit 1
							)`
						})
						.where(eq(DB_SCHEMA.channels.ytChannelId, data.ytChannelId));

					return upsertResult;
				})
			)
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
			wasInserted: result?.wasInserted ?? false,
			wasSkipped: false
		};
	});

	const deleteVideo = (ytVideoId: string) =>
		db
			.delete(DB_SCHEMA.videos)
			.where(eq(DB_SCHEMA.videos.ytVideoId, ytVideoId))
			.pipe(
				Effect.mapError(
					(cause) => new DbError({ message: `Failed to delete video ${ytVideoId}`, cause })
				)
			);

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

					yield* tx
						.update(DB_SCHEMA.channels)
						.set({ ytLiveVideoId: null })
						.where(inArray(DB_SCHEMA.channels.ytLiveVideoId, ytVideoIds));

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

	const cleanupStaleLiveReferences = Effect.fn('cleanupStaleLiveReferences')(function* () {
		const result = yield* db
			.update(DB_SCHEMA.channels)
			.set({ ytLiveVideoId: null })
			.where(
				sql`
				${DB_SCHEMA.channels.ytLiveVideoId} is not null
				and not exists (
					select 1
					from ${DB_SCHEMA.videos}
					where ${DB_SCHEMA.videos.ytVideoId} = ${DB_SCHEMA.channels.ytLiveVideoId}
						and ${DB_SCHEMA.videos.livestreamType} = 'live'
						and ${DB_SCHEMA.videos.privacyStatus} = 'public'
				)
			`
			)
			.returning({ ytChannelId: DB_SCHEMA.channels.ytChannelId })
			.pipe(
				Effect.mapError(
					(cause) => new DbError({ message: 'Failed to clear stale live video references', cause })
				)
			);

		return result.length;
	});

	const deleteChannel = (ytChannelId: string) =>
		db
			.delete(DB_SCHEMA.channels)
			.where(eq(DB_SCHEMA.channels.ytChannelId, ytChannelId))
			.pipe(
				Effect.mapError(
					(cause) => new DbError({ message: `Failed to delete channel ${ytChannelId}`, cause })
				)
			);

	const deleteAllVideos = () =>
		db
			.delete(DB_SCHEMA.videos)
			.pipe(
				Effect.mapError((cause) => new DbError({ message: `Failed to delete all videos`, cause }))
			);

	const deleteAllChannels = () =>
		db
			.delete(DB_SCHEMA.channels)
			.pipe(
				Effect.mapError((cause) => new DbError({ message: `Failed to delete all channels`, cause }))
			);

	return {
		getAllChannels,
		getChannel,
		getVideo,
		getVideos,
		updateChannel,
		upsertChannel,
		upsertVideo,
		deleteVideo,
		deleteChannel,
		deleteAllVideos,
		deleteAllChannels,
		markVideosAsPrivate,
		cleanupStaleLiveReferences
	};
});

type DbServiceShape = Effect.Success<typeof dbService>;

export class DbService extends Context.Service<DbService, DbServiceShape>()(
	'@hc/content-sync/db/DbService'
) {}
