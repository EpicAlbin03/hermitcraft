import { getRecentVideosForChannel, syncVideos, syncChannels, channelIds } from '@hc/db';

const syncChannelsJob = async () => {
	const start = performance.now();
	console.log('Starting channel sync job...');

	const ytChannelIds = channelIds.map((c) => c.id);

	const channelsResult = await syncChannels({ ytChannelIds });
	if (channelsResult.isErr()) {
		console.error('CHANNEL SYNC FAILED:', channelsResult.error);
		return;
	}

	console.log(
		`CHANNEL SYNC COMPLETED: ${channelsResult.value.successCount} synced, ${channelsResult.value.errorCount} failed`
	);
	console.log(`CHANNEL SYNC TOOK ${performance.now() - start}ms`);
};

const syncVideosJob = async () => {
	const start = performance.now();
	console.log('Starting video sync job...');

	const ytChannelIds = channelIds.map((c) => c.id);

	const allRecentVideosResults = await Promise.allSettled(
		ytChannelIds.map(async (ytChannelId) => {
			return getRecentVideosForChannel({ ytChannelId });
		})
	);

	const allVideoIds: string[] = [];
	for (const result of allRecentVideosResults) {
		if (result.status === 'fulfilled' && result.value.isOk()) {
			const recentVideos = result.value.value;
			allVideoIds.push(...recentVideos.map((v: { ytVideoId: string }) => v.ytVideoId));
		}
	}

	const syncVideosResult = await syncVideos({ ytVideoIds: allVideoIds });
	if (syncVideosResult.isErr()) {
		console.error('VIDEO SYNC FAILED:', syncVideosResult.error);
		return;
	}

	console.log(
		`VIDEO SYNC COMPLETED: ${syncVideosResult.value.successCount} synced, ${syncVideosResult.value.errorCount} failed`
	);
	console.log(`VIDEO SYNC TOOK ${performance.now() - start}ms`);
};

const CHANNEL_SYNC_DELAY_MS = 24 * 60 * 60 * 1000; // 24 hours
const VIDEO_SYNC_DELAY_MS = 60 * 60 * 1000; // 1 hour

// DISABLED TEMPORARILY
// setInterval(() => {
// 	syncChannelsJob();
// }, CHANNEL_SYNC_DELAY_MS);

// setInterval(() => {
// 	syncVideosJob();
// }, VIDEO_SYNC_DELAY_MS);

// syncChannelsJob();
// syncVideosJob();
