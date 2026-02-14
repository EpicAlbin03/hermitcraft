import { drizzle } from 'drizzle-orm/mysql2';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import { createPool, type Pool } from 'mysql2/promise';
import * as mySchema from './schema';

export const getDrizzleInstance = (dbUrl: string) =>
	drizzle(createPool({ uri: dbUrl, connectionLimit: 10 }), {
		mode: 'default',
		schema: mySchema
	});

export type DbConnection = MySql2Database<typeof mySchema> & { $client: Pool };
