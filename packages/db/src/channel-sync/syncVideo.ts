import { err, ok } from 'neverthrow';
import { getVideoDetails } from './youtube/helpers';
import { DB_MUTATIONS, DB_QUERIES } from './db';

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
		ytChannelId: videoDetails.value.channelId,
		title: videoDetails.value.title,
		description: videoDetails.value.description,
		thumbnailUrl: videoDetails.value.thumbnailUrl,
		publishedAt: new Date(videoDetails.value.publishedAt),
		viewCount: videoDetails.value.viewCount,
		likeCount: videoDetails.value.likeCount,
		commentCount: videoDetails.value.commentCount
	});

	if (upsertVideoResult.isErr()) {
		return err(new SyncVideoError(upsertVideoResult.error.message));
	}

	const { wasInserted } = upsertVideoResult.value;

	const channelResult = await DB_QUERIES.getChannel(videoDetails.value.channelId);

	if (channelResult.isErr()) {
		return err(new SyncVideoError(channelResult.error.message));
	} else if (!channelResult.value) {
		return err(new SyncVideoError('Channel not found'));
	}

	const channel = channelResult.value;

	if (wasInserted) {
		// Do stuff
	}

	return ok(undefined);
};
