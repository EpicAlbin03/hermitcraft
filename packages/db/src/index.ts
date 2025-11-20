import { getDbConnection } from './connection';

export * as DB_SCHEMA from './schema';
export * from './connection';
export * from 'drizzle-orm';
export * from './channel-sync';

export const dbClient = getDbConnection(Bun.env.MYSQL_URL!);
