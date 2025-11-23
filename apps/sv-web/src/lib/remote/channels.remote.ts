import { query } from '$app/server';
import { DB_QUERIES } from '$lib/db/queries';
import { error } from '@sveltejs/kit';
import { z } from 'zod';

export const remoteGetSidebarChannels = query(async () => {
	const channels = await DB_QUERIES.getSidebarChannels();
	if (channels.status === 'error') {
		console.error(channels.cause);
		return error(500, { message: channels.message });
	}
	return channels.data;
});

export type SidebarChannel = Awaited<ReturnType<typeof remoteGetSidebarChannels>>[number];

export const remoteGetChannelDetails = query(z.string(), async (handle) => {
	const channel = await DB_QUERIES.getChannelByHandle(handle);
	if (channel.status === 'error') {
		console.error(channel.cause);
		return error(500, { message: channel.message });
	}
	if (!channel.data) {
		return error(404, { message: 'Channel not found' });
	}
	return channel.data;
});

export type ChannelDetails = Awaited<ReturnType<typeof remoteGetChannelDetails>>;

export const remoteGetChannelVideos = query(z.string(), async (ytChannelId) => {
	const videos = await DB_QUERIES.getChannelVideos(ytChannelId);
	if (videos.status === 'error') {
		console.error(videos.cause);
		return error(500, { message: videos.message });
	}
	return videos.data;
});

export type ChannelVideos = Awaited<ReturnType<typeof remoteGetChannelVideos>>;
