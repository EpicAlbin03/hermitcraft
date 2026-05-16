import { DB } from '@hc/db/connection';
import { DB_SCHEMA, type Channel, type Video } from '@hc/db/schema';
import * as Option from 'effect/Option';
import * as Effect from 'effect/Effect';
import * as Context from 'effect/Context';
import * as Data from 'effect/Data';
import * as Console from 'effect/Console';
import { and, eq, getColumns, inArray, isNotNull } from 'drizzle-orm';

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

	const updateChannel = (ytChannelId: string, data: Partial<Channel>) =>
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

	const upsertChannel = (data: Channel) =>
		Effect.gen(function* () {
			const existing = yield* getChannel(data.ytChannelId);

			if (Option.isSome(existing)) {
				yield* updateChannel(data.ytChannelId, {
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

				return { ytChannelId: data.ytChannelId, wasInserted: false };
			}

			yield* db
				.insert(DB_SCHEMA.channels)
				.values(data)
				.pipe(
					Effect.mapError(
						(cause) =>
							new DbError({ message: `Failed to insert channel ${data.ytChannelId}`, cause })
					)
				);

			return { ytChannelId: data.ytChannelId, wasInserted: true };
		});

	const upsertVideo = (data: Video) =>
		Effect.gen(function* () {
			const durationSeconds = parseIsoDurationToSeconds(data.duration);
			const isLiveOrUpcoming = data.livestreamType === 'live' || data.livestreamType === 'upcoming';

			if ((durationSeconds === null || durationSeconds === 0) && !isLiveOrUpcoming) {
				yield* Console.warn(
					`\x1b[33mDuration is 0 or invalid for video ${data.ytVideoId}, skipping\x1b[0m`
				);
				return { ytVideoId: data.ytVideoId, wasInserted: false, wasSkipped: true };
			}

			const existing = yield* getVideo(data.ytVideoId);
			const existingVideo = Option.getOrNull(existing);
			const livestreamTypeChanged =
				existingVideo && existingVideo.livestreamType !== data.livestreamType;
			const shouldUpdateChannel = !existingVideo || livestreamTypeChanged;

			if (shouldUpdateChannel) {
				yield* db
					.transaction((tx) =>
						Effect.gen(function* () {
							if (existingVideo) {
								yield* tx
									.update(DB_SCHEMA.videos)
									.set(data)
									.where(eq(DB_SCHEMA.videos.ytVideoId, data.ytVideoId));
							} else {
								yield* tx.insert(DB_SCHEMA.videos).values(data);
							}

							const channel = yield* tx
								.select({ ytLiveVideoId: DB_SCHEMA.channels.ytLiveVideoId })
								.from(DB_SCHEMA.channels)
								.where(eq(DB_SCHEMA.channels.ytChannelId, data.ytChannelId))
								.limit(1);

							const currentLiveVideoId = channel[0]?.ytLiveVideoId;

							if (data.livestreamType === 'live') {
								yield* tx
									.update(DB_SCHEMA.channels)
									.set({ ytLiveVideoId: data.ytVideoId })
									.where(eq(DB_SCHEMA.channels.ytChannelId, data.ytChannelId));
							} else if (currentLiveVideoId === data.ytVideoId) {
								yield* tx
									.update(DB_SCHEMA.channels)
									.set({ ytLiveVideoId: null })
									.where(eq(DB_SCHEMA.channels.ytChannelId, data.ytChannelId));
							}
						})
					)
					.pipe(
						Effect.mapError(
							(cause) =>
								new DbError({
									message: `Failed to upsert video ${data.ytVideoId} with channel update`,
									cause
								})
						)
					);

				return { ytVideoId: data.ytVideoId, wasInserted: !existingVideo, wasSkipped: false };
			}

			yield* db
				.update(DB_SCHEMA.videos)
				.set(data)
				.where(eq(DB_SCHEMA.videos.ytVideoId, data.ytVideoId))
				.pipe(
					Effect.mapError(
						(cause) => new DbError({ message: `Failed to update video ${data.ytVideoId}`, cause })
					)
				);

			return { ytVideoId: data.ytVideoId, wasInserted: false, wasSkipped: false };
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

	const markVideosAsPrivate = (ytVideoIds: string[]) =>
		Effect.gen(function* () {
			if (ytVideoIds.length === 0) return 0;

			const result = yield* db
				.update(DB_SCHEMA.videos)
				.set({ privacyStatus: 'private' })
				.where(inArray(DB_SCHEMA.videos.ytVideoId, ytVideoIds))
				.pipe(
					Effect.mapError(
						(cause) =>
							new DbError({
								message: `Failed to mark ${ytVideoIds.length} videos as private`,
								cause
							})
					)
				);

			yield* db
				.update(DB_SCHEMA.videos)
				.set({ livestreamType: 'completed' })
				.where(
					and(
						inArray(DB_SCHEMA.videos.ytVideoId, ytVideoIds),
						eq(DB_SCHEMA.videos.livestreamType, 'live')
					)
				)
				.pipe(
					Effect.mapError(
						(cause) =>
							new DbError({
								message: `Failed to mark ${ytVideoIds.length} live videos as completed`,
								cause
							})
					)
				);

			yield* db
				.update(DB_SCHEMA.channels)
				.set({ ytLiveVideoId: null })
				.where(inArray(DB_SCHEMA.channels.ytLiveVideoId, ytVideoIds))
				.pipe(
					Effect.mapError(
						(cause) =>
							new DbError({
								message: `Failed to clear live video refs for ${ytVideoIds.length} private videos`,
								cause
							})
					)
				);

			return result.length;
		});

	const cleanupStaleLiveReferences = () =>
		Effect.gen(function* () {
			const channelsWithLive = yield* db
				.select({
					ytChannelId: DB_SCHEMA.channels.ytChannelId,
					ytLiveVideoId: DB_SCHEMA.channels.ytLiveVideoId
				})
				.from(DB_SCHEMA.channels)
				.where(isNotNull(DB_SCHEMA.channels.ytLiveVideoId))
				.pipe(
					Effect.mapError(
						(cause) => new DbError({ message: 'Failed to get channels with live videos', cause })
					)
				);

			if (channelsWithLive.length === 0) return 0;

			const liveVideoIds = channelsWithLive.flatMap((channel) => channel.ytLiveVideoId ?? []);
			const validLiveVideos = yield* db
				.select({ ytVideoId: DB_SCHEMA.videos.ytVideoId })
				.from(DB_SCHEMA.videos)
				.where(
					and(
						inArray(DB_SCHEMA.videos.ytVideoId, liveVideoIds),
						eq(DB_SCHEMA.videos.livestreamType, 'live'),
						eq(DB_SCHEMA.videos.privacyStatus, 'public')
					)
				)
				.pipe(
					Effect.mapError(
						(cause) =>
							new DbError({
								message: `Failed to validate ${liveVideoIds.length} live videos`,
								cause
							})
					)
				);

			const validLiveVideoIds = new Set(validLiveVideos.map((video) => video.ytVideoId));
			const staleChannelIds = channelsWithLive
				.filter((channel) => channel.ytLiveVideoId && !validLiveVideoIds.has(channel.ytLiveVideoId))
				.map((channel) => channel.ytChannelId);

			if (staleChannelIds.length === 0) return 0;

			yield* db
				.update(DB_SCHEMA.channels)
				.set({ ytLiveVideoId: null })
				.where(inArray(DB_SCHEMA.channels.ytChannelId, staleChannelIds))
				.pipe(
					Effect.mapError(
						(cause) =>
							new DbError({
								message: `Failed to clear ${staleChannelIds.length} stale live video references`,
								cause
							})
					)
				);

			return staleChannelIds.length;
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
