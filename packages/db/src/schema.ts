import { mysqlTable as table } from 'drizzle-orm/mysql-core';
import * as t from 'drizzle-orm/mysql-core';
import type { ChannelLink } from '.';

export const channels = table('channels', {
	ytChannelId: t.varchar('yt_channel_id', { length: 24 }).primaryKey(),
	ytName: t.varchar('yt_name', { length: 60 }).notNull(),
	ytHandle: t.varchar('yt_handle', { length: 30 }).notNull(),
	ytDescription: t.text('yt_description').notNull(),
	ytAvatarUrl: t.varchar('yt_avatar_url', { length: 255 }).notNull(),
	ytBannerUrl: t.varchar('yt_banner_url', { length: 255 }).notNull(),
	ytBannerThumbHash: t.text('yt_banner_thumb_hash'),
	ytViewCount: t.bigint('yt_view_count', { mode: 'number' }).notNull(),
	ytSubscriberCount: t.int('yt_subscriber_count').notNull(),
	ytVideoCount: t.int('yt_video_count').notNull(),
	ytJoinedAt: t.datetime('yt_joined_at').notNull(),
	twitchUserId: t.varchar('twitch_user_id', { length: 20 }), // Grows sequentially, about 8-12 so far
	twitchUserLogin: t.varchar('twitch_user_login', { length: 25 }),
	// twitchUsername: t.varchar('twitch_username', { length: 50 }), // Max 25, but can include non-latin characters
	isTwitchLive: t.boolean('is_twitch_live').notNull(),
	ytLiveVideoId: t.varchar('yt_live_video_id', { length: 11 }).references(() => videos.ytVideoId),
	links: t.json('links').$type<ChannelLink[]>().notNull(),
	createdAt: t.timestamp('created_at').notNull().defaultNow(),
	modifiedAt: t.timestamp('modified_at').notNull().defaultNow()
});

export const videos = table(
	'videos',
	{
		ytVideoId: t.varchar('yt_video_id', { length: 11 }).primaryKey(), // 64^11 possibilities
		ytChannelId: t.varchar('yt_channel_id', { length: 24 }).notNull(),
		title: t.varchar('title', { length: 100 }).notNull(),
		thumbnailUrl: t.varchar('thumbnail_url', { length: 255 }).notNull(),
		publishedAt: t.datetime('published_at').notNull(),
		privacyStatus: t.mysqlEnum('privacy_status', ['private', 'public', 'unlisted']).notNull(),
		uploadStatus: t
			.mysqlEnum('upload_status', ['deleted', 'failed', 'processed', 'rejected', 'uploaded'])
			.notNull(),
		viewCount: t.int('view_count').notNull(),
		likeCount: t.int('like_count').notNull(),
		commentCount: t.int('comment_count').notNull(),
		duration: t.varchar('duration', { length: 30 }).notNull(),
		isShort: t.boolean('is_short').notNull(),
		livestreamType: t
			.mysqlEnum('livestream_type', ['live', 'none', 'upcoming', 'completed'])
			.notNull()
			.default('none'),
		livestreamScheduledStartTime: t.datetime('livestream_scheduled_start_time'),
		livestreamActualStartTime: t.datetime('livestream_actual_start_time'),
		livestreamConcurrentViewers: t.int('livestream_concurrent_viewers'),
		createdAt: t.timestamp('created_at').notNull().defaultNow(),
		modifiedAt: t.timestamp('modified_at').notNull().defaultNow()
	},
	(table) => [t.index('yt_channel_id_and_published_at').on(table.ytChannelId, table.publishedAt)]
);
