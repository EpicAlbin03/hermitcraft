import { getDrizzleInstance } from '@hc/db';

export const dbClient = getDrizzleInstance(Bun.env.MYSQL_URL!);

export * from './queries';
export * from './mutations';
