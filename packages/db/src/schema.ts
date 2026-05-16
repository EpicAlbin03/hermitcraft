import * as t from 'drizzle-orm/pg-core';
import type { ChannelLink } from '.';

export const privacyStatusEnum = t.pgEnum('privacy_status', ['private', 'public', 'unlisted']);
export const uploadStatusEnum = t.pgEnum('upload_status', [
	'deleted',
	'failed',
	'processed',
	'rejected',
	'uploaded'
]);
export const livestreamTypeEnum = t.pgEnum('livestream_type', [
	'live',
	'none',
	'upcoming',
	'completed'
]);

export const channels = t.pgTable('channels', {
	ytChannelId: t.varchar('yt_channel_id', { length: 24 }).primaryKey(),
	ytName: t.varchar('yt_name', { length: 60 }).notNull(),
	ytHandle: t.varchar('yt_handle', { length: 30 }).notNull(),
	ytDescription: t.text('yt_description').notNull(),
	ytAvatarUrl: t.varchar('yt_avatar_url', { length: 255 }).notNull(),
	ytBannerUrl: t.varchar('yt_banner_url', { length: 255 }).notNull(),
	ytBannerThumbHash: t.text('yt_banner_thumb_hash'),
	ytViewCount: t.bigint('yt_view_count', { mode: 'number' }).notNull(),
	ytSubscriberCount: t.integer('yt_subscriber_count').notNull(),
	ytVideoCount: t.integer('yt_video_count').notNull(),
	ytJoinedAt: t.timestamp('yt_joined_at').notNull(),
	twitchUserId: t.varchar('twitch_user_id', { length: 20 }),
	twitchUserLogin: t.varchar('twitch_user_login', { length: 25 }),
	// twitchUsername: t.varchar('twitch_username', { length: 50 }), // Max 25, but can include non-latin characters
	isTwitchLive: t.boolean('is_twitch_live').notNull(),
	ytLiveVideoId: t.varchar('yt_live_video_id', { length: 11 }).references(() => videos.ytVideoId),
	links: t.jsonb('links').$type<ChannelLink[]>().notNull(),
	createdAt: t.timestamp('created_at').notNull().defaultNow(),
	modifiedAt: t.timestamp('modified_at').notNull().defaultNow()
});

export const videos = t.pgTable(
	'videos',
	{
		ytVideoId: t.varchar('yt_video_id', { length: 11 }).primaryKey(), // 64^11 possibilities
		ytChannelId: t.varchar('yt_channel_id', { length: 24 }).notNull(),
		title: t.varchar('title', { length: 100 }).notNull(),
		thumbnailUrl: t.varchar('thumbnail_url', { length: 255 }).notNull(),
		publishedAt: t.timestamp('published_at').notNull(),
		privacyStatus: privacyStatusEnum('privacy_status').notNull(),
		uploadStatus: uploadStatusEnum('upload_status').notNull(),
		viewCount: t.integer('view_count').notNull(),
		likeCount: t.integer('like_count').notNull(),
		commentCount: t.integer('comment_count').notNull(),
		duration: t.varchar('duration', { length: 30 }).notNull(),
		isShort: t.boolean('is_short').notNull(),
		livestreamType: livestreamTypeEnum('livestream_type').notNull().default('none'),
		livestreamScheduledStartTime: t.timestamp('livestream_scheduled_start_time'),
		livestreamActualStartTime: t.timestamp('livestream_actual_start_time'),
		livestreamConcurrentViewers: t.integer('livestream_concurrent_viewers'),
		createdAt: t.timestamp('created_at').notNull().defaultNow(),
		modifiedAt: t.timestamp('modified_at').notNull().defaultNow()
	},
	(table) => [
		t.index('yt_channel_id_and_published_at').on(table.ytChannelId, table.publishedAt),
		t
			.index('channel_filtered_videos')
			.on(
				table.ytChannelId,
				table.privacyStatus,
				table.uploadStatus,
				table.livestreamType,
				table.isShort,
				table.publishedAt
			),
		t
			.index('all_filtered_videos')
			.on(
				table.privacyStatus,
				table.uploadStatus,
				table.livestreamType,
				table.isShort,
				table.publishedAt
			),
		t.index('view_count').on(table.viewCount),
		t.index('like_count').on(table.likeCount)
	]
);
