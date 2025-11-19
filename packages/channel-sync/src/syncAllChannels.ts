import { err, ok } from 'neverthrow';
import { getAllChannels } from './youtube/helpers';
import { DB_MUTATIONS } from './db';

class SyncChannelError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'SyncChannelError';
	}
}

export const syncAllChannels = async () => {
	const channels = await getAllChannels();
	if (channels.isErr()) {
		return err(new Error('Failed to get all channels'));
	}

	const upsertChannelsResult = await Promise.all(
		channels.value.map((channel) =>
			DB_MUTATIONS.upsertChannel({
				ytChannelId: channel.ytChannelId,
				name: channel.name,
				description: channel.description,
				thumbnailUrl: channel.thumbnailUrl
			})
		)
	);

	for (const result of upsertChannelsResult) {
		if (result.isErr()) {
			return err(new SyncChannelError(result.error.message));
		} else if (!result.value) {
			return err(new SyncChannelError('Channel not found'));
		}
	}

	return ok(undefined);
};
