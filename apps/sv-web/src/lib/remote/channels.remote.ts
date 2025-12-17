import { query } from '$app/server';
import { DbRemoteRunner } from '$lib/remote/helpers';
import { Effect } from 'effect';
import { z } from 'zod';

const videoFilterSchema = z.enum(['videos', 'shorts', 'livestreams']);
const videoSortSchema = z.enum(['latest', 'most_viewed', 'most_liked', 'oldest']);

export const remoteGetSidebarChannels = query(async () => {
	return DbRemoteRunner(({ db }) =>
		Effect.gen(function* () {
			const [channels, liveStatus] = yield* Effect.all([
				db.getSidebarChannels(),
				db.getLiveStatus()
			]);
			return channels.map((channel) => ({
				...channel,
				...liveStatus[channel.ytHandle]
			}));
		})
	);
});

export type SidebarChannel = Awaited<ReturnType<typeof remoteGetSidebarChannels>>[number];

export const remoteGetLiveStatus = query(async () => {
	return DbRemoteRunner(({ db }) => db.getLiveStatus());
});

export type LiveStatus = Awaited<ReturnType<typeof remoteGetLiveStatus>>;

export const remoteGetChannelDetails = query(z.string(), async (handle) => {
	return DbRemoteRunner(({ db }) =>
		Effect.gen(function* () {
			const [channel, liveStatus] = yield* Effect.all([
				db.getChannelByHandle(handle),
				db.getLiveStatus()
			]);
			return {
				...channel,
				...liveStatus[channel.ytHandle]
			};
		})
	);
});

export type ChannelDetails = Awaited<ReturnType<typeof remoteGetChannelDetails>>;

const paginationSchema = z.object({
	limit: z.number().min(1).max(100),
	offset: z.number().min(0),
	filter: videoFilterSchema.default('videos'),
	sort: videoSortSchema.default('latest'),
	onlyHermitCraft: z.boolean().default(false)
});

export const remoteGetChannelVideos = query(
	z.object({
		ytChannelId: z.string(),
		...paginationSchema.shape
	}),
	async ({ ytChannelId, limit, offset, filter, sort, onlyHermitCraft }) => {
		return DbRemoteRunner(({ db }) =>
			db.getChannelVideos(ytChannelId, limit, offset, filter, sort, onlyHermitCraft)
		);
	}
);

export type ChannelVideos = Awaited<ReturnType<typeof remoteGetChannelVideos>>;

export const remoteGetAllVideos = query(
	paginationSchema,
	async ({ limit, offset, filter, sort, onlyHermitCraft }) => {
		return DbRemoteRunner(({ db }) =>
			db.getAllVideos(limit, offset, filter, sort, onlyHermitCraft)
		);
	}
);
