import { err, ok } from 'neverthrow';
import { getChannelDetails } from './youtube';
import { DB_MUTATIONS } from './db';

class SyncChannelError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'SyncChannelError';
	}
}

export const syncChannel = async (args: { ytChannelId: string }) => {
	const channelDetails = await getChannelDetails(args);

	if (channelDetails.isErr()) {
		return err(new SyncChannelError(channelDetails.error.message));
	}

	const upsertChannelResult = await DB_MUTATIONS.upsertChannel({
		ytChannelId: args.ytChannelId,
		name: channelDetails.value.name,
		description: channelDetails.value.description,
		thumbnailUrl: channelDetails.value.thumbnailUrl,
		bannerUrl: channelDetails.value.bannerUrl,
		handle: channelDetails.value.handle,
		viewCount: channelDetails.value.viewCount,
		subscriberCount: channelDetails.value.subscriberCount,
		videoCount: channelDetails.value.videoCount,
		joinedAt: channelDetails.value.joinedAt
	});

	if (upsertChannelResult.isErr()) {
		return err(new SyncChannelError(upsertChannelResult.error.message));
	}

	return ok(undefined);
};

export const syncChannels = async (args: { ytChannelIds: string[] }) => {
	let successCount = 0;
	let errorCount = 0;

	await Promise.allSettled(
		args.ytChannelIds.map(async (ytChannelId) => {
			console.log(`Syncing channel ${ytChannelId}`);
			const syncChannelResult = await syncChannel({ ytChannelId });
			if (syncChannelResult.isOk()) {
				successCount++;
				console.log(`Synced channel ${ytChannelId}`);
			} else {
				errorCount++;
				console.error('Failed to sync channel:', syncChannelResult.error);
			}
		})
	);

	console.log(`Synced ${successCount} channels, failed to sync ${errorCount} channels`);
	return ok({ successCount, errorCount });
};
