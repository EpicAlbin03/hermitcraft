import { DB_SCHEMA, getDrizzleInstance, eq, type Video, type Channel } from '@hc/db';
import { Effect } from 'effect';
import { TaggedError } from 'effect/Data';

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

	const upsertChannel = (data: Omit<Channel, 'createdAt'>) =>
		Effect.gen(function* () {
			const existing = yield* getChannel(data.ytChannelId);

			if (existing) {
				yield* Effect.tryPromise({
					try: () =>
						drizzle
							.update(DB_SCHEMA.channels)
							.set({
								description: data.description,
								thumbnailUrl: data.thumbnailUrl,
								bannerUrl: data.bannerUrl,
								viewCount: data.viewCount,
								subscriberCount: data.subscriberCount,
								videoCount: data.videoCount
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
							name: data.name,
							description: data.description,
							thumbnailUrl: data.thumbnailUrl,
							bannerUrl: data.bannerUrl,
							handle: data.handle,
							viewCount: data.viewCount,
							subscriberCount: data.subscriberCount,
							videoCount: data.videoCount,
							joinedAt: data.joinedAt
						}),
					catch: (err) =>
						new DbError('Failed to insert channel', {
							cause: err
						})
				});

				return { ytChannelId: data.ytChannelId, wasInserted: true };
			}
		});

	const upsertVideo = (data: Omit<Video, 'createdAt'>) =>
		Effect.gen(function* () {
			const existing = yield* getVideo(data.ytVideoId);

			if (existing) {
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
								duration: data.duration
							})
							.where(eq(DB_SCHEMA.videos.ytVideoId, data.ytVideoId)),
					catch: (err) =>
						new DbError('Failed to update video', {
							cause: err
						})
				});

				return { ytVideoId: data.ytVideoId, wasInserted: false };
			} else {
				yield* Effect.tryPromise({
					try: () =>
						drizzle.insert(DB_SCHEMA.videos).values({
							ytVideoId: data.ytVideoId,
							ytChannelId: data.ytChannelId,
							title: data.title,
							thumbnailUrl: data.thumbnailUrl,
							publishedAt: data.publishedAt,
							viewCount: data.viewCount,
							likeCount: data.likeCount,
							commentCount: data.commentCount,
							duration: data.duration,
							isLiveStream: data.isLiveStream,
							isShort: data.isShort
						}),
					catch: (err) =>
						new DbError('Failed to insert video', {
							cause: err
						})
				});

				return { ytVideoId: data.ytVideoId, wasInserted: true };
			}
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
		deleteAllVideos,
		deleteAllChannels
	};
});

export class DbService extends Effect.Service<DbService>()('DbService', {
	scoped: dbService
}) {}
