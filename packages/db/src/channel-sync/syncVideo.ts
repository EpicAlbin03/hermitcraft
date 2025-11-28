import { err, ok } from 'neverthrow';
import { getVideoDetails } from './youtube';
import { DB_MUTATIONS } from './db';

class SyncVideoError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'SyncVideoError';
	}
}

export const syncVideo = async (args: { ytVideoId: string }) => {
	const videoDetails = await getVideoDetails(args);

	if (videoDetails.isErr()) {
		return err(new SyncVideoError(videoDetails.error.message));
	}

	const upsertVideoResult = await DB_MUTATIONS.upsertVideo({
		ytVideoId: args.ytVideoId,
		ytChannelId: videoDetails.value.ytChannelId,
		title: videoDetails.value.title,
		thumbnailUrl: videoDetails.value.thumbnailUrl,
		thumbnailWidth: videoDetails.value.thumbnailWidth,
		thumbnailHeight: videoDetails.value.thumbnailHeight,
		publishedAt: videoDetails.value.publishedAt,
		viewCount: videoDetails.value.viewCount,
		likeCount: videoDetails.value.likeCount,
		commentCount: videoDetails.value.commentCount,
		duration: videoDetails.value.duration,
		isLiveStream: videoDetails.value.isLiveStream
	});

	if (upsertVideoResult.isErr()) {
		return err(new SyncVideoError(upsertVideoResult.error.message));
	}

	return ok(undefined);
};

export const syncVideos = async (args: { ytVideoIds: string[] }) => {
	let successCount = 0;
	let errorCount = 0;

	await Promise.allSettled(
		args.ytVideoIds.map(async (ytVideoId) => {
			console.log(`Syncing video ${ytVideoId}`);
			const syncVideoResult = await syncVideo({ ytVideoId });
			if (syncVideoResult.isOk()) {
				successCount++;
				console.log(`Synced video ${ytVideoId}`);
			} else {
				errorCount++;
				console.error('Failed to sync video:', syncVideoResult.error);
			}
		})
	);

	console.log(`Synced ${successCount} videos, failed to sync ${errorCount} videos`);
	return ok({ successCount, errorCount });
};
