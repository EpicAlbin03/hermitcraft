import { drizzle } from 'drizzle-orm/mysql2';
import * as mySchema from './schema';

export const getDrizzleInstance = (dbUrl: string) =>
	drizzle(dbUrl, { mode: 'default', schema: mySchema });

export type DbConnection = ReturnType<typeof getDrizzleInstance>;
