import { dbClient } from '.';
import { syncAllChannels } from './channel-sync';

async function main() {
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
