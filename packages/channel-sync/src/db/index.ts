import { DB_SCHEMA, getDrizzleInstance, eq, and, type Video, type Channel } from '@hc/db';
import { Console, Effect } from 'effect';
import { TaggedError } from 'effect/Data';
import { parseIsoDurationToSeconds } from '../youtube/utils';

class DbError extends TaggedError('DbError') {
	constructor(message: string, options?: { cause?: unknown }) {
		super();
		this.message = message;
		this.cause = options?.cause;
	}
}

const dbService = Effect.gen(function* () {
	const dbUrl = yield* Effect.sync(() => Bun.env.MYSQL_URL);
	if (!dbUrl) {
		return yield* Effect.die('MYSQL_URL is not set...');
	}

	const drizzle = yield* Effect.acquireRelease(
		Effect.try(() => getDrizzleInstance(dbUrl)),
		(db) =>
			Effect.sync(() => {
				console.log('Closing database connection...');
				db.$client.end();
			})
	).pipe(
		Effect.catchAll((err) => {
			console.error('Failed to connect to database...', err);
			return Effect.die('Failed to connect to database...');
		})
	);

	const getAllChannels = () =>
		Effect.gen(function* () {
			const channels = yield* Effect.tryPromise({
				try: () => drizzle.select().from(DB_SCHEMA.channels),
				catch: (err) =>
					new DbError('Failed to get all channels...', {
						cause: err
					})
			});

			return channels;
		});

	const getChannel = (ytChannelId: string) =>
		Effect.gen(function* () {
			const channels = yield* Effect.tryPromise({
				try: () =>
					drizzle
						.select()
						.from(DB_SCHEMA.channels)
						.where(eq(DB_SCHEMA.channels.ytChannelId, ytChannelId))
						.limit(1),
				catch: (err) =>
					new DbError('Failed to get channel', {
						cause: err
					})
			});

			return channels[0] || null;
		});

	const getVideo = (ytVideoId: string) =>
		Effect.gen(function* () {
			const videos = yield* Effect.tryPromise({
				try: () =>
					drizzle
						.select()
						.from(DB_SCHEMA.videos)
						.where(eq(DB_SCHEMA.videos.ytVideoId, ytVideoId))
						.limit(1),
				catch: (err) =>
					new DbError('Failed to get video', {
						cause: err
					})
			});

			return videos[0] || null;
		});

	const upsertChannel = (data: Channel) =>
		Effect.gen(function* () {
			const existing = yield* getChannel(data.ytChannelId);

			if (existing) {
				yield* Effect.tryPromise({
					try: () =>
						drizzle
							.update(DB_SCHEMA.channels)
							.set({
								ytName: data.ytName,
								ytHandle: data.ytHandle,
								ytDescription: data.ytDescription,
								ytAvatarUrl: data.ytAvatarUrl,
								ytBannerUrl: data.ytBannerUrl,
								ytViewCount: data.ytViewCount,
								ytSubscriberCount: data.ytSubscriberCount,
								ytVideoCount: data.ytVideoCount,
								twitchUserLogin: data.twitchUserLogin,
								isTwitchLive: data.isTwitchLive,
								ytLiveVideoId: data.ytLiveVideoId,
								links: data.links
							})
							.where(eq(DB_SCHEMA.channels.ytChannelId, data.ytChannelId)),
					catch: (err) =>
						new DbError('Failed to update channel', {
							cause: err
						})
				});

				return { ytChannelId: data.ytChannelId, wasInserted: false };
			} else {
				yield* Effect.tryPromise({
					try: () =>
						drizzle.insert(DB_SCHEMA.channels).values({
							ytChannelId: data.ytChannelId,
							ytName: data.ytName,
							ytHandle: data.ytHandle,
							ytDescription: data.ytDescription,
							ytAvatarUrl: data.ytAvatarUrl,
							ytBannerUrl: data.ytBannerUrl,
							ytViewCount: data.ytViewCount,
							ytSubscriberCount: data.ytSubscriberCount,
							ytVideoCount: data.ytVideoCount,
							ytJoinedAt: data.ytJoinedAt,
							twitchUserId: data.twitchUserId,
							twitchUserLogin: data.twitchUserLogin,
							isTwitchLive: data.isTwitchLive,
							ytLiveVideoId: data.ytLiveVideoId,
							links: data.links
						}),
					catch: (err) =>
						new DbError('Failed to insert channel', {
							cause: err
						})
				});

				return { ytChannelId: data.ytChannelId, wasInserted: true };
			}
		});

	const upsertVideo = (data: Video) =>
		Effect.gen(function* () {
			const durationSeconds = parseIsoDurationToSeconds(data.duration);
			if (durationSeconds === null || durationSeconds === 0) {
				yield* Console.warn(
					`\x1b[33mDuration is 0 or invalid for video ${data.ytVideoId}, skipping\x1b[0m`
				);
				return { ytVideoId: data.ytVideoId, wasInserted: false, wasSkipped: true };
			}

			const existing = yield* getVideo(data.ytVideoId);
			const livestreamTypeChanged = existing && existing.livestreamType !== data.livestreamType;
			const shouldUpdateChannel = !existing || livestreamTypeChanged;

			if (shouldUpdateChannel) {
				// Use transaction to update both video and channel atomically
				yield* Effect.tryPromise({
					try: () =>
						drizzle.transaction(async (tx) => {
							if (existing) {
								await tx
									.update(DB_SCHEMA.videos)
									.set({
										title: data.title,
										thumbnailUrl: data.thumbnailUrl,
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
								await tx.insert(DB_SCHEMA.videos).values({
									ytVideoId: data.ytVideoId,
									ytChannelId: data.ytChannelId,
									title: data.title,
									thumbnailUrl: data.thumbnailUrl,
									publishedAt: data.publishedAt,
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

							const ytLiveVideoId = data.livestreamType === 'live' ? data.ytVideoId : null;

							await tx
								.update(DB_SCHEMA.channels)
								.set({ ytLiveVideoId: ytLiveVideoId })
								.where(eq(DB_SCHEMA.channels.ytChannelId, data.ytChannelId));
						}),
					catch: (err) =>
						new DbError('Failed to upsert video with channel update', {
							cause: err
						})
				});

				return { ytVideoId: data.ytVideoId, wasInserted: !existing, wasSkipped: false };
			}

			// No livestreamType change, just update video normally
			yield* Effect.tryPromise({
				try: () =>
					drizzle
						.update(DB_SCHEMA.videos)
						.set({
							title: data.title,
							thumbnailUrl: data.thumbnailUrl,
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
				catch: (err) =>
					new DbError('Failed to update video', {
						cause: err
					})
			});

			return { ytVideoId: data.ytVideoId, wasInserted: false, wasSkipped: false };
		});

	const deleteVideo = (ytVideoId: string) =>
		Effect.tryPromise({
			try: () => drizzle.delete(DB_SCHEMA.videos).where(eq(DB_SCHEMA.videos.ytVideoId, ytVideoId)),
			catch: (err) =>
				new DbError('Failed to delete video', {
					cause: err
				})
		});

	const deleteChannel = (ytChannelId: string) =>
		Effect.tryPromise({
			try: () =>
				drizzle.delete(DB_SCHEMA.channels).where(eq(DB_SCHEMA.channels.ytChannelId, ytChannelId)),
			catch: (err) =>
				new DbError('Failed to delete channel', {
					cause: err
				})
		});

	const deleteAllVideos = () =>
		Effect.tryPromise({
			try: () => drizzle.delete(DB_SCHEMA.videos),
			catch: (err) =>
				new DbError('Failed to wipe videos table', {
					cause: err
				})
		});

	const deleteAllChannels = () =>
		Effect.tryPromise({
			try: () => drizzle.delete(DB_SCHEMA.channels),
			catch: (err) =>
				new DbError('Failed to wipe channels table', {
					cause: err
				})
		});

	return {
		getAllChannels,
		getChannel,
		getVideo,
		upsertChannel,
		upsertVideo,
		deleteVideo,
		deleteChannel,
		deleteAllVideos,
		deleteAllChannels
	};
});

export class DbService extends Effect.Service<DbService>()('DbService', {
	scoped: dbService
}) {}
