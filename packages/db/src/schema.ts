import { mysqlTable as table } from 'drizzle-orm/mysql-core';
import * as t from 'drizzle-orm/mysql-core';

export const channels = table('channels', {
	ytChannelId: t.varchar('yt_channel_id', { length: 55 }).primaryKey(),
	twitchUserId: t.varchar('twitch_user_id', { length: 10 }).notNull(),
	name: t.text('name').notNull(),
	description: t.text('description').notNull(),
	thumbnailUrl: t.text('thumbnail_url').notNull(),
	bannerUrl: t.text('banner_url').notNull(),
	handle: t.text('custom_url').notNull(),
	viewCount: t.bigint('view_count', { mode: 'number' }).notNull(),
	subscriberCount: t.int('subscriber_count').notNull(),
	videoCount: t.int('video_count').notNull(),
	joinedAt: t.datetime('joined_at').notNull(),
	isLive: t.boolean('is_live').notNull().default(false),
	createdAt: t.timestamp('created_at').notNull().defaultNow()
});

export const videos = table(
	'videos',
	{
		ytVideoId: t.varchar('yt_video_id', { length: 55 }).primaryKey(),
		ytChannelId: t.varchar('yt_channel_id', { length: 55 }).notNull(),
		title: t.text('title').notNull(),
		thumbnailUrl: t.text('thumbnail_url').notNull(),
		publishedAt: t.datetime('published_at').notNull(),
		viewCount: t.int('view_count').notNull(),
		likeCount: t.int('like_count').notNull(),
		commentCount: t.int('comment_count').notNull(),
		duration: t.varchar('duration', { length: 30 }).notNull(),
		isLiveStream: t.boolean('is_live_stream').notNull().default(false),
		isShort: t.boolean('is_short').notNull().default(false),
		createdAt: t.timestamp('created_at').notNull().defaultNow()
	},
	(table) => [t.index('yt_channel_id_and_published_at').on(table.ytChannelId, table.publishedAt)]
);
