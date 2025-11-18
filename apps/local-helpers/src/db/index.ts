import { getDbConnection } from '@hc/db';

export const dbClient = getDbConnection(Bun.env.DATABASE_URL!);
