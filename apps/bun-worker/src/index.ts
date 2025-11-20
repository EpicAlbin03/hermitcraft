import { getRecentVideosForChannel, syncVideo } from '@hc/db';
import { DB_QUERIES } from './db';

const main = async () => {
	const start = performance.now();
	const channels = await DB_QUERIES.getAllChannels();
	if (channels.isErr()) {
		console.error('LIVE CRAWLER CRASHED: Failed to get all channels', channels.error);
		return;
	}

	const channelsValue = channels.value;

	const allRecentVideosResults = await Promise.allSettled(
		channelsValue.map(async (channel) =>
			getRecentVideosForChannel({ ytChannelId: channel.ytChannelId })
		)
	);

	let successCount = 0;
	let errorCount = 0;

	for (const result of allRecentVideosResults) {
		if (result.status === 'fulfilled' && result.value.isOk()) {
			const recentVideos = result.value.value;
			await Promise.allSettled(
				recentVideos.map(async (video) => {
					console.log(`Syncing video ${video.videoId} - ${video.title}`);
					const syncVideoResult = await syncVideo({
						ytVideoId: video.videoId
					});
					if (syncVideoResult.isOk()) {
						successCount++;
						console.log(`Synced video ${video.videoId} - ${video.title}`);
					} else {
						errorCount++;
						console.error('LIVE CRAWLER CRASHED: Failed to sync video', syncVideoResult.error);
					}
				})
			);
		}
	}

	console.log(`LIVE CRAWLER COMPLETED: ${successCount} videos synced, ${errorCount} videos failed`);
	console.log(`LIVE CRAWLER TOOK ${performance.now() - start}ms`);
};

const DELAY_MS = 60 * 60 * 1000; // 1 hour

// DISABLED TEMPORARILY
// setInterval(() => {
// 	main();
// }, DELAY_MS);

// main();
