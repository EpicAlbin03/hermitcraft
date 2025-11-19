import { mysqlTable as table } from 'drizzle-orm/mysql-core';
import * as t from 'drizzle-orm/mysql-core';

export const channels = table('channels', {
	ytChannelId: t.varchar('yt_channel_id', { length: 55 }).primaryKey(),
	name: t.text('name').notNull(),
	description: t.text('description').notNull(),
	thumbnailUrl: t.text('thumbnail_url').notNull(),
	createdAt: t.timestamp('created_at').notNull().defaultNow()
});

export const videos = table(
	'videos',
	{
		ytVideoId: t.varchar('yt_video_id', { length: 55 }).primaryKey(),
		ytChannelId: t.varchar('yt_channel_id', { length: 55 }).notNull(),
		title: t.text('title').notNull(),
		description: t.text('description').notNull(),
		thumbnailUrl: t.text('thumbnail_url').notNull(),
		publishedAt: t.datetime('published_at').notNull(),
		viewCount: t.int('view_count').notNull(),
		likeCount: t.int('like_count').notNull(),
		commentCount: t.int('comment_count').notNull(),
		createdAt: t.timestamp('created_at').notNull().defaultNow()
	},
	(table) => [t.index('yt_channel_id_and_published_at').on(table.ytChannelId, table.publishedAt)]
);
