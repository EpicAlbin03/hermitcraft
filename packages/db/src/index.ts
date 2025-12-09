import { channels, videos } from './schema';

export type ChannelLink = {
	title: string;
	url: string;
};

export const DB_SCHEMA = { channels, videos };
export type ChannelSchema = typeof channels.$inferSelect;
export type Channel = Omit<ChannelSchema, 'createdAt' | 'modifiedAt'>;
export type VideoSchema = typeof videos.$inferSelect;
export type Video = Omit<VideoSchema, 'createdAt' | 'modifiedAt'>;

export * from './connection';
export * from 'drizzle-orm';
