import { drizzle } from 'drizzle-orm/mysql2';
import { DB_SCHEMA } from '.';

export const getDrizzleInstance = (dbUrl: string) => {
	if (!dbUrl) throw new Error('MYSQL_URL env is missing');
	return drizzle(dbUrl, { mode: 'default', schema: DB_SCHEMA });
};

export type DbConnection = ReturnType<typeof getDrizzleInstance>;
