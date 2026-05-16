import {
	DB_SCHEMA,
	getDrizzleInstance,
	eq,
	inArray,
	and,
	isNotNull,
	type Video,
	type Channel
} from '@hc/db';
import { Console, Context, Effect, Layer } from 'effect';
import { TaggedError } from 'effect/Data';
import { parseIsoDurationToSeconds } from '../youtube/utils';

class DbError extends TaggedError('DbError')<{
	message: string;
	cause?: unknown;
}> {}

const dbService = Effect.gen(function* () {
	const dbUrl = yield* Effect.sync(() => Bun.env.MYSQL_URL);
	if (!dbUrl) {
		return yield* Effect.die('MYSQL_URL is not set...');
	}

	const drizzle = yield* getDrizzleInstance(dbUrl).pipe(
		Effect.catch((err) => {
			console.error('Failed to connect to database...', err);
			return Effect.die('Failed to connect to database...');
		})
	);

	const withDbError = <A, E, R>(effect: Effect.Effect<A, E, R>, message: string) =>
		effect.pipe(Effect.mapError((cause) => new DbError({ message, cause })));

	type ChannelColumns = typeof DB_SCHEMA.channels;
	type ChannelSelection = {
		[K in keyof ChannelColumns]?: ChannelColumns[K];
	};
	type ChannelSelectResult<T extends Partial<ChannelSelection> | undefined> = T extends undefined
		? Channel
		: keyof T extends never
			? Channel
			: Pick<Channel, Extract<keyof T, keyof Channel>>;
	type VideoColumns = typeof DB_SCHEMA.videos;
	type VideoSelection = {
		[K in keyof VideoColumns]?: VideoColumns[K];
	};
	type VideoSelectResult<T extends Partial<VideoSelection> | undefined> = T extends undefined
		? Video
		: keyof T extends never
			? Video
			: Pick<Video, Extract<keyof T, keyof Video>>;

	const getAllChannels = <T extends Partial<ChannelSelection> | undefined = undefined>(
		selection?: T
	) =>
		Effect.gen(function* () {
			const channels = yield* withDbError(
				drizzle.select(selection ?? {}).from(DB_SCHEMA.channels),
				'Failed to get all channels...'
			);

			return channels as ChannelSelectResult<T>[];
		});

	const getChannel = <T extends Partial<ChannelSelection> | undefined = undefined>(
		ytChannelId: string,
		selection?: T
	) =>
		Effect.gen(function* () {
			const channels = yield* withDbError(
				drizzle
					.select(selection ?? {})
					.from(DB_SCHEMA.channels)
					.where(eq(DB_SCHEMA.channels.ytChannelId, ytChannelId))
					.limit(1),
				'Failed to get channel'
			);

			return (channels[0] ?? null) as ChannelSelectResult<T> | null;
		});

	const getVideo = <T extends Partial<VideoSelection> | undefined = undefined>(
		ytVideoId: string,
		selection?: T
	) =>
		Effect.gen(function* () {
			const videos = yield* withDbError(
				drizzle
					.select(selection ?? {})
					.from(DB_SCHEMA.videos)
					.where(eq(DB_SCHEMA.videos.ytVideoId, ytVideoId))
					.limit(1),
				'Failed to get video'
			);

			return (videos[0] ?? null) as VideoSelectResult<T> | null;
		});

	const getVideos = <T extends Partial<VideoSelection> | undefined = undefined>(
		ytVideoIds: string[],
		selection?: T
	) =>
		Effect.gen(function* () {
			if (ytVideoIds.length === 0) return [] as VideoSelectResult<T>[];

			const videos = yield* withDbError(
				drizzle
					.select(selection ?? {})
					.from(DB_SCHEMA.videos)
					.where(inArray(DB_SCHEMA.videos.ytVideoId, ytVideoIds)),
				'Failed to get videos'
			);

			return videos as VideoSelectResult<T>[];
		});

	const updateChannel = (ytChannelId: string, data: Partial<Channel>) =>
		withDbError(
			drizzle
				.update(DB_SCHEMA.channels)
				.set(data)
				.where(eq(DB_SCHEMA.channels.ytChannelId, ytChannelId)),
			'Failed to update channel'
		);

	const upsertChannel = (
		data: Omit<
			Channel,
			| 'twitchUserId'
			| 'twitchUserLogin'
			| 'isTwitchLive'
			| 'ytLiveVideoId'
			| 'links'
			| 'ytBannerThumbHash'
		> &
			Partial<
				Pick<
					Channel,
					| 'twitchUserId'
					| 'twitchUserLogin'
					| 'isTwitchLive'
					| 'ytLiveVideoId'
					| 'links'
					| 'ytBannerThumbHash'
				>
			>
	) =>
		Effect.gen(function* () {
			const existing = yield* getChannel(data.ytChannelId, {
				ytChannelId: DB_SCHEMA.channels.ytChannelId
			});

			if (existing) {
				yield* withDbError(
					drizzle
						.update(DB_SCHEMA.channels)
						.set({
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
							// isTwitchLive: handled by twitchSyncProgram
							// ytLiveVideoId: handled by videoSyncProgram
							links: data.links
						})
						.where(eq(DB_SCHEMA.channels.ytChannelId, data.ytChannelId)),
					'Failed to update channel'
				);

				return { ytChannelId: data.ytChannelId, wasInserted: false };
			}

			yield* withDbError(
				drizzle.insert(DB_SCHEMA.channels).values({
					ytChannelId: data.ytChannelId,
					ytName: data.ytName,
					ytHandle: data.ytHandle,
					ytDescription: data.ytDescription,
					ytAvatarUrl: data.ytAvatarUrl,
					ytBannerUrl: data.ytBannerUrl,
					ytBannerThumbHash: data.ytBannerThumbHash || null,
					ytViewCount: data.ytViewCount,
					ytSubscriberCount: data.ytSubscriberCount,
					ytVideoCount: data.ytVideoCount,
					ytJoinedAt: data.ytJoinedAt,
					twitchUserId: data.twitchUserId,
					twitchUserLogin: data.twitchUserLogin || null,
					isTwitchLive: data.isTwitchLive || false,
					ytLiveVideoId: data.ytLiveVideoId || null,
					links: data.links || []
				}),
				'Failed to insert channel'
			);

			return { ytChannelId: data.ytChannelId, wasInserted: true };
		});

	const upsertVideo = (data: Video) =>
		Effect.gen(function* () {
			const durationSeconds = parseIsoDurationToSeconds(data.duration);
			const isLiveOrUpcoming = data.livestreamType === 'live' || data.livestreamType === 'upcoming';
			// Allow 0-duration for live/upcoming streams (they don't have a duration yet)
			if ((durationSeconds === null || durationSeconds === 0) && !isLiveOrUpcoming) {
				yield* Console.warn(
					`\x1b[33mDuration is 0 or invalid for video ${data.ytVideoId}, skipping\x1b[0m`
				);
				return { ytVideoId: data.ytVideoId, wasInserted: false, wasSkipped: true };
			}

			const existing = yield* getVideo(data.ytVideoId, {
				ytVideoId: DB_SCHEMA.videos.ytVideoId,
				livestreamType: DB_SCHEMA.videos.livestreamType
			});
			const livestreamTypeChanged = existing && existing.livestreamType !== data.livestreamType;
			const shouldUpdateChannel = !existing || livestreamTypeChanged;

			if (shouldUpdateChannel) {
				// Use transaction to update both video and channel atomically
				yield* withDbError(
					drizzle.transaction((tx) =>
						Effect.gen(function* () {
							if (existing) {
								yield* tx
									.update(DB_SCHEMA.videos)
									.set({
										title: data.title,
										thumbnailUrl: data.thumbnailUrl,
										privacyStatus: data.privacyStatus,
										uploadStatus: data.uploadStatus,
										viewCount: data.viewCount,
										likeCount: data.likeCount,
										commentCount: data.commentCount,
										duration: data.duration,
										isShort: data.isShort,
										livestreamType: data.livestreamType,
										livestreamScheduledStartTime: data.livestreamScheduledStartTime,
										livestreamActualStartTime: data.livestreamActualStartTime,
										livestreamConcurrentViewers: data.livestreamConcurrentViewers
									})
									.where(eq(DB_SCHEMA.videos.ytVideoId, data.ytVideoId));
							} else {
								yield* tx.insert(DB_SCHEMA.videos).values({
									ytVideoId: data.ytVideoId,
									ytChannelId: data.ytChannelId,
									title: data.title,
									thumbnailUrl: data.thumbnailUrl,
									publishedAt: data.publishedAt,
									privacyStatus: data.privacyStatus,
									uploadStatus: data.uploadStatus,
									viewCount: data.viewCount,
									likeCount: data.likeCount,
									commentCount: data.commentCount,
									duration: data.duration,
									isShort: data.isShort,
									livestreamType: data.livestreamType,
									livestreamScheduledStartTime: data.livestreamScheduledStartTime,
									livestreamActualStartTime: data.livestreamActualStartTime,
									livestreamConcurrentViewers: data.livestreamConcurrentViewers
								});
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
					),
					'Failed to upsert video with channel update'
				);

				return { ytVideoId: data.ytVideoId, wasInserted: !existing, wasSkipped: false };
			}

			// No livestreamType change, just update video normally
			yield* withDbError(
				drizzle
					.update(DB_SCHEMA.videos)
					.set({
						title: data.title,
						thumbnailUrl: data.thumbnailUrl,
						privacyStatus: data.privacyStatus,
						uploadStatus: data.uploadStatus,
						viewCount: data.viewCount,
						likeCount: data.likeCount,
						commentCount: data.commentCount,
						duration: data.duration,
						isShort: data.isShort,
						livestreamType: data.livestreamType,
						livestreamScheduledStartTime: data.livestreamScheduledStartTime,
						livestreamActualStartTime: data.livestreamActualStartTime,
						livestreamConcurrentViewers: data.livestreamConcurrentViewers
					})
					.where(eq(DB_SCHEMA.videos.ytVideoId, data.ytVideoId)),
				'Failed to update video'
			);

			return { ytVideoId: data.ytVideoId, wasInserted: false, wasSkipped: false };
		});

	const deleteVideo = (ytVideoId: string) =>
		withDbError(
			drizzle.delete(DB_SCHEMA.videos).where(eq(DB_SCHEMA.videos.ytVideoId, ytVideoId)),
			'Failed to delete video'
		);

	const markVideosAsPrivate = (ytVideoIds: string[]) =>
		Effect.gen(function* () {
			if (ytVideoIds.length === 0) return 0;

			yield* withDbError(
				drizzle
					.update(DB_SCHEMA.videos)
					.set({ privacyStatus: 'private' })
					.where(inArray(DB_SCHEMA.videos.ytVideoId, ytVideoIds)),
				'Failed to mark videos as private'
			);

			// Mark live streams as completed (they ended and went private)
			yield* withDbError(
				drizzle
					.update(DB_SCHEMA.videos)
					.set({ livestreamType: 'completed' })
					.where(
						and(
							inArray(DB_SCHEMA.videos.ytVideoId, ytVideoIds),
							eq(DB_SCHEMA.videos.livestreamType, 'live')
						)
					),
				'Failed to mark live videos as completed'
			);

			// Clear ytLiveVideoId on channels referencing any of these now-private videos
			yield* withDbError(
				drizzle
					.update(DB_SCHEMA.channels)
					.set({ ytLiveVideoId: null })
					.where(inArray(DB_SCHEMA.channels.ytLiveVideoId, ytVideoIds)),
				'Failed to clear live video refs for private videos'
			);

			return ytVideoIds.length;
		});

	const cleanupStaleLiveReferences = () =>
		Effect.gen(function* () {
			const channelsWithLive = yield* withDbError(
				drizzle
					.select({
						ytChannelId: DB_SCHEMA.channels.ytChannelId,
						ytLiveVideoId: DB_SCHEMA.channels.ytLiveVideoId
					})
					.from(DB_SCHEMA.channels)
					.where(isNotNull(DB_SCHEMA.channels.ytLiveVideoId)),
				'Failed to get channels with live videos'
			);

			if (channelsWithLive.length === 0) return 0;

			const liveVideoIds = channelsWithLive
				.map((channel) => channel.ytLiveVideoId)
				.filter((id): id is string => id !== null);

			const validLiveVideos = yield* withDbError(
				drizzle
					.select({ ytVideoId: DB_SCHEMA.videos.ytVideoId })
					.from(DB_SCHEMA.videos)
					.where(
						and(
							inArray(DB_SCHEMA.videos.ytVideoId, liveVideoIds),
							eq(DB_SCHEMA.videos.livestreamType, 'live'),
							eq(DB_SCHEMA.videos.privacyStatus, 'public')
						)
					),
				'Failed to validate live videos'
			);

			const validLiveVideoIds = new Set(validLiveVideos.map((video) => video.ytVideoId));
			const staleChannelIds = channelsWithLive
				.filter((channel) => channel.ytLiveVideoId && !validLiveVideoIds.has(channel.ytLiveVideoId))
				.map((channel) => channel.ytChannelId);

			if (staleChannelIds.length === 0) return 0;

			yield* withDbError(
				drizzle
					.update(DB_SCHEMA.channels)
					.set({ ytLiveVideoId: null })
					.where(inArray(DB_SCHEMA.channels.ytChannelId, staleChannelIds)),
				'Failed to clear stale live video references'
			);

			return staleChannelIds.length;
		});

	const deleteChannel = (ytChannelId: string) =>
		withDbError(
			drizzle.delete(DB_SCHEMA.channels).where(eq(DB_SCHEMA.channels.ytChannelId, ytChannelId)),
			'Failed to delete channel'
		);

	const deleteAllVideos = () =>
		withDbError(drizzle.delete(DB_SCHEMA.videos), 'Failed to wipe videos table');

	const deleteAllChannels = () =>
		withDbError(drizzle.delete(DB_SCHEMA.channels), 'Failed to wipe channels table');

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

export class DbService extends Context.Service<DbService>()('DbService', {
	make: dbService
}) {
	static layer = Layer.effect(this)(this.make);
}
