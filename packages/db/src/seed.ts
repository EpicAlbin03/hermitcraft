import { DB_SCHEMA } from '.';
import { channelIds } from './channeIds';
import { getDbConnection } from './connection';

async function main() {
	const dbClient = getDbConnection(Bun.env.MYSQL_URL!);

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
