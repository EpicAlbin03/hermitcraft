import { syncChannels, syncVideos, getRecentVideosForChannel, channelIds } from './channel-sync';

const askQuestion = (prompt: string) =>
	new Promise<string>((res) => {
		process.stdout.write(prompt);
		let data = '';
		const handler = (chunk: Buffer) => {
			data += chunk.toString();
			if (data.endsWith('\n')) {
				process.stdin.off('data', handler);
				res(data.trim());
			}
		};
		process.stdin.on('data', handler);
	});

async function main() {
	const ytChannelIds = channelIds.map((c) => c.id);

	const confirmTablesInput = await askQuestion('Specify which tables to seed? (y/N): ');
	const wantsSpecificTables = /^y(es)?$/i.test(confirmTablesInput.trim());

	const availableTables = ['channels', 'videos'];
	let tablesToSeed = availableTables;

	if (wantsSpecificTables) {
		const selection = await askQuestion(
			`Select tables to seed (comma-separated). Available: ${availableTables.join(', ')}: `
		);
		const selected = selection
			.split(',')
			.map((item) => item.trim())
			.filter(Boolean);

		const uniqueSelected = Array.from(new Set(selected));
		const filtered = uniqueSelected.filter((name) => availableTables.includes(name));

		if (filtered.length === 0) {
			console.log('No valid tables selected. Aborting.');
			process.exit(0);
		}

		tablesToSeed = filtered;
	}

	const shouldSyncChannels = tablesToSeed.includes('channels');
	const shouldSyncVideos = tablesToSeed.includes('videos');

	const tableNames = tablesToSeed.join(', ');
	const confirmation = await askQuestion(
		`This will seed the following tables: ${tableNames}. Type "yes" to continue: `
	);
	if (confirmation.trim() !== 'yes') {
		console.log('Aborted.');
		process.exit(0);
	}

	console.log(`Seeding tables: ${tableNames}...`);

	if (shouldSyncChannels) {
		console.log('Syncing channels...');
		const channelsResult = await syncChannels({ ytChannelIds });
		if (channelsResult.isErr()) {
			console.error('Channel sync failed:', channelsResult.error);
		} else {
			console.log(
				`Channels synced: ${channelsResult.value.successCount} success, ${channelsResult.value.errorCount} failed`
			);
		}
	}

	if (shouldSyncVideos) {
		console.log('Fetching recent videos...');
		const allRecentVideosResults = await Promise.allSettled(
			ytChannelIds.map(async (ytChannelId) => {
				return getRecentVideosForChannel({ ytChannelId });
			})
		);

		const allVideoIds: string[] = [];
		for (const result of allRecentVideosResults) {
			if (result.status === 'fulfilled' && result.value.isOk()) {
				const recentVideos = result.value.value;
				allVideoIds.push(...recentVideos.map((v) => v.ytVideoId));
			}
		}

		console.log(`Syncing ${allVideoIds.length} videos...`);
		const syncVideosResult = await syncVideos({ ytVideoIds: allVideoIds });
		if (syncVideosResult.isErr()) {
			console.error('Video sync failed:', syncVideosResult.error);
		} else {
			console.log(
				`Videos synced: ${syncVideosResult.value.successCount} success, ${syncVideosResult.value.errorCount} failed`
			);
		}
	}

	console.log('DB tables seeded successfully');
	process.exit(0);
}

main();
