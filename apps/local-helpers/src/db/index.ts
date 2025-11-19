import { getDbConnection } from '@hc/db';

export const dbClient = getDbConnection(Bun.env.MYSQL_URL!);
