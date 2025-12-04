import { query } from '$app/server';
import { DbRemoteRunner } from '$lib/remote/helpers';
import { z } from 'zod';

const videoFilterSchema = z.enum(['videos', 'shorts', 'livestreams']);

export const remoteGetSidebarChannels = query(async () => {
	return DbRemoteRunner(({ db }) => db.getSidebarChannels());
});

export type SidebarChannel = Awaited<ReturnType<typeof remoteGetSidebarChannels>>[number];

export const remoteGetChannelDetails = query(z.string(), async (handle) => {
	return DbRemoteRunner(({ db }) => db.getChannelByHandle(handle));
});

export type ChannelDetails = Awaited<ReturnType<typeof remoteGetChannelDetails>>;

const paginationSchema = z.object({
	limit: z.number().min(1).max(100),
	offset: z.number().min(0),
	filter: videoFilterSchema
});

export const remoteGetChannelVideos = query(
	z.object({
		ytChannelId: z.string(),
		...paginationSchema.shape
	}),
	async ({ ytChannelId, limit, offset, filter }) => {
		return DbRemoteRunner(({ db }) => db.getChannelVideos(ytChannelId, limit, offset, filter));
	}
);

export type ChannelVideos = Awaited<ReturnType<typeof remoteGetChannelVideos>>;

export const remoteGetAllVideos = query(paginationSchema, async ({ limit, offset, filter }) => {
	return DbRemoteRunner(({ db }) => db.getAllVideos(limit, offset, filter));
});
