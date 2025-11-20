import { syncAllChannels } from './channel-sync';
import { getDbConnection } from './connection';

async function main() {
	const dbClient = getDbConnection(Bun.env.MYSQL_URL!);

	const syncAllChannelsResult = await syncAllChannels();
	if (syncAllChannelsResult.isOk()) {
		console.log('All channels synced successfully');
	} else {
		console.error('Failed to sync all channels:', syncAllChannelsResult.error);
	}

	await dbClient.$client.end();
	process.exit(0);
}

main();
