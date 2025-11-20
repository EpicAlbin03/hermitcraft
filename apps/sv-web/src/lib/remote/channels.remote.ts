import { form, query } from '$app/server';
import { DB_MUTATIONS } from '$lib/db/mutations';
import { DB_QUERIES } from '$lib/db/queries';
import { error } from '@sveltejs/kit';
import z from 'zod';

export const remoteGetAllChannels = query(async () => {
	// const event = getRequestEvent();
	// const isAuthenticated = event.locals.checkAuth(event);
	// if (!isAuthenticated) {
	// 	return error(401, { message: 'Unauthorized' });
	// }
	const channels = await DB_QUERIES.getAllChannels();
	if (channels.status === 'error') {
		console.error(channels.cause);
		return error(500, { message: channels.message });
	}
	return channels.data;
});

export const remoteCreateChannel = form(
	z.object({
		ytChannelId: z.string(),
		name: z.string(),
		description: z.string(),
		thumbnailUrl: z.string()
	}),
	async (data) => {
		// const event = getRequestEvent();
		// const isAuthenticated = event.locals.checkAuth(event);
		// if (!isAuthenticated) {
		// 	return error(401, { message: 'Unauthorized' });
		// }
		const createChannel = await DB_MUTATIONS.createChannel(data);
		if (createChannel.status === 'error') {
			console.error(createChannel.cause);
			return error(500, { message: createChannel.message });
		}
		await remoteGetAllChannels().refresh();
		return {
			success: true
		};
	}
);

export const remoteGetChannelDetails = query(z.string(), async (ytChannelId) => {
	// const event = getRequestEvent();
	// const isAuthenticated = event.locals.checkAuth(event);
	// if (!isAuthenticated) {
	// 	return error(401, { message: 'Unauthorized' });
	// }
	const channel = await DB_QUERIES.getChannelDetails(ytChannelId);
	if (channel.status === 'error') {
		console.error(channel.cause);
		return error(500, { message: channel.message });
	}
	if (!channel.data) {
		return error(404, { message: 'Channel not found' });
	}
	return channel.data;
});

export const remoteGetChannelVideos = query(z.string(), async (ytChannelId) => {
	// const event = getRequestEvent();
	// const isAuthenticated = event.locals.checkAuth(event);
	// if (!isAuthenticated) {
	// 	return error(401, { message: 'Unauthorized' });
	// }
	const videos = await DB_QUERIES.getChannelVideos(ytChannelId);
	if (videos.status === 'error') {
		console.error(videos.cause);
		return error(500, { message: videos.message });
	}
	return videos.data;
});

export const remoteGetVideoDetails = query(z.string(), async (ytVideoId) => {
	// const event = getRequestEvent();
	// const isAuthenticated = event.locals.checkAuth(event);
	// if (!isAuthenticated) {
	// 	return error(401, { message: 'Unauthorized' });
	// }
	const result = await DB_QUERIES.getVideoDetails(ytVideoId);
	if (result.status === 'error') {
		console.error(result.cause);
		if (result.message === 'Video not found') {
			return error(404, { message: result.message });
		}
		return error(500, { message: result.message });
	}

	return result.data;
});
