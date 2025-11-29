import { getRSSVideos, syncVideos, syncChannels, channelIds, YT_QUERIES } from '@hc/db';

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

	// 1. Fetch RSS videos from all channels
	const rssResults = await Promise.allSettled(
		ytChannelIds.map(async (ytChannelId) => await getRSSVideos({ ytChannelId }))
	);

	// 2. Collect all RSS videos
	const allRssVideos: Awaited<ReturnType<typeof getRSSVideos>> extends infer R
		? R extends { value: infer V }
			? V extends Array<infer Item>
				? Item[]
				: never
			: never
		: never = [];

	for (const result of rssResults) {
		if (result.status === 'fulfilled' && result.value.isOk()) {
			allRssVideos.push(...result.value.value);
		}
	}

	// 3. Batch video IDs (50 per request) and fetch remaining details
	const BATCH_SIZE = 50;
	const videoIds = allRssVideos.map((v) => v.ytVideoId);
	const batches: string[][] = [];
	for (let i = 0; i < videoIds.length; i += BATCH_SIZE) {
		batches.push(videoIds.slice(i, i + BATCH_SIZE));
	}

	const batchResults = await Promise.allSettled(
		batches.map((batch) => YT_QUERIES.getBatchRSSVideoDetails({ ytVideoIds: batch }))
	);

	// 4. Merge all batch results into a single map
	const detailsMap: Record<
		string,
		{ commentCount: number; duration: string; isLiveStream: boolean; isShort: boolean }
	> = {};
	for (const result of batchResults) {
		if (result.status === 'fulfilled' && result.value.isOk()) {
			Object.assign(detailsMap, result.value.value);
		}
	}

	// 5. Combine RSS data with fetched details
	const allRecentVideos = allRssVideos.map((rss) => ({
		...rss,
		...detailsMap[rss.ytVideoId]
	}));

	const allVideoIds = allRecentVideos.map((v) => v.ytVideoId);

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
