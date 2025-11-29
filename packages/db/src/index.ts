import { channels, videos } from './schema';

export const DB_SCHEMA = { channels, videos };
export type Channel = typeof channels.$inferSelect;
export type Video = typeof videos.$inferSelect;
export * from './connection';
export * from 'drizzle-orm';
