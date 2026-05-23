import * as d from 'drizzle-orm/pg-core';

export type ChannelSchema = typeof channels.$inferSelect;
export type Channel = Omit<ChannelSchema, 'createdAt' | 'modifiedAt'>;
export type VideoSchema = typeof videos.$inferSelect;
export type Video = Omit<VideoSchema, 'createdAt' | 'modifiedAt'>;

export type ChannelLink = {
	title: string;
	url: string;
};

export const privacyStatusEnum = d.pgEnum('privacy_status', ['private', 'public', 'unlisted']);
export const uploadStatusEnum = d.pgEnum('upload_status', [
	'deleted',
	'failed',
	'processed',
	'rejected',
	'uploaded'
]);
export const livestreamTypeEnum = d.pgEnum('livestream_type', [
	'live',
	'none',
	'upcoming',
	'completed'
]);

export const channels = d.pgTable('channels', {
	ytChannelId: d.varchar('yt_channel_id', { length: 24 }).primaryKey(),
	ytName: d.varchar('yt_name', { length: 60 }).notNull(),
	ytHandle: d.varchar('yt_handle', { length: 30 }).notNull(),
	ytDescription: d.text('yt_description').notNull(),
	ytAvatarUrl: d.varchar('yt_avatar_url', { length: 255 }).notNull(),
	ytBannerUrl: d.varchar('yt_banner_url', { length: 255 }).notNull(),
	ytBannerThumbHash: d.text('yt_banner_thumb_hash'),
	ytViewCount: d.bigint('yt_view_count', { mode: 'number' }).notNull(),
	ytSubscriberCount: d.integer('yt_subscriber_count').notNull(),
	ytVideoCount: d.integer('yt_video_count').notNull(),
	ytJoinedAt: d.timestamp('yt_joined_at').notNull(),
	twitchUserId: d.varchar('twitch_user_id', { length: 20 }),
	twitchUserLogin: d.varchar('twitch_user_login', { length: 25 }),
	// twitchUsername: d.varchar('twitch_username', { length: 50 }), // Max 25, but can include non-latin characters
	isTwitchLive: d.boolean('is_twitch_live').notNull(),
	links: d.jsonb('links').$type<ChannelLink[]>().notNull(),
	createdAt: d.timestamp('created_at').notNull().defaultNow(),
	modifiedAt: d.timestamp('modified_at').notNull().defaultNow()
});

export const videos = d.pgTable(
	'videos',
	{
		ytVideoId: d.varchar('yt_video_id', { length: 11 }).primaryKey(), // 64^11 possibilities
		ytChannelId: d
			.varchar('yt_channel_id', { length: 24 })
			.notNull()
			.references((): d.PgColumn => channels.ytChannelId, { onDelete: 'cascade' }),
		title: d.varchar('title', { length: 100 }).notNull(),
		thumbnailUrl: d.varchar('thumbnail_url', { length: 255 }).notNull(),
		publishedAt: d.timestamp('published_at').notNull(),
		privacyStatus: privacyStatusEnum('privacy_status').notNull(),
		uploadStatus: uploadStatusEnum('upload_status').notNull(),
		viewCount: d.integer('view_count').notNull(),
		likeCount: d.integer('like_count').notNull(),
		commentCount: d.integer('comment_count').notNull(),
		durationSeconds: d.integer('duration_seconds'),
		isShort: d.boolean('is_short').notNull(),
		livestreamType: livestreamTypeEnum('livestream_type').notNull().default('none'),
		livestreamScheduledStartTime: d.timestamp('livestream_scheduled_start_time'),
		livestreamActualStartTime: d.timestamp('livestream_actual_start_time'),
		livestreamConcurrentViewers: d.integer('livestream_concurrent_viewers'),
		createdAt: d.timestamp('created_at').notNull().defaultNow(),
		modifiedAt: d.timestamp('modified_at').notNull().defaultNow()
	},
	(table) => [
		d.index('yt_channel_id_and_published_at').on(table.ytChannelId, table.publishedAt),
		d
			.index('channel_filtered_videos')
			.on(
				table.ytChannelId,
				table.privacyStatus,
				table.uploadStatus,
				table.livestreamType,
				table.isShort,
				table.publishedAt
			),
		d
			.index('all_filtered_videos')
			.on(
				table.privacyStatus,
				table.uploadStatus,
				table.livestreamType,
				table.isShort,
				table.publishedAt
			),
		d.index('view_count').on(table.viewCount),
		d.index('like_count').on(table.likeCount)
	]
);

export const DB_SCHEMA = {
	channels,
	videos
};
