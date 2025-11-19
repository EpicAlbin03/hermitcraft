import { DB_SCHEMA } from '.';
import { channelIds } from './channeIds';
import { getDbConnection } from './connection';

export * as DB_SCHEMA from './schema';
export * from './connection';
export * from 'drizzle-orm';

async function main() {
	const dbClient = getDbConnection(Bun.env.DATABASE_URL!);

	await dbClient.insert(DB_SCHEMA.channels).values(
		channelIds.map((channel) => ({
			ytChannelId: channel.id,
			name: channel.name
		}))
	);
	console.log('Channels inserted successfully');

	await dbClient.$client.end();
}

main();
