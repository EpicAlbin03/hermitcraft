import { getRequestEvent, query } from '$app/server';
import { DbRemoteRunner, getClientIp } from '$lib/remote/helpers';
import type { RateLimitKey } from '$lib/services/cache';
import { Effect } from 'effect';
import { z } from 'zod';

const videoFilterSchema = z.enum(['videos', 'shorts', 'livestreams']);
const videoSortSchema = z.enum(['latest', 'most_viewed', 'most_liked', 'oldest']);

function getRateLimit(endpoint: RateLimitKey) {
	const event = getRequestEvent();
	if (!event) return undefined;
	return {
		ip: getClientIp(event.request, event.getClientAddress),
		endpoint
	};
}

export const remoteGetSidebarChannels = query(async () => {
	const rateLimit = getRateLimit('sidebar');
	return DbRemoteRunner(
		({ db }) =>
			Effect.gen(function* () {
				const [channels, liveStatus] = yield* Effect.all([
					db.getSidebarChannels(),
					db.getLiveStatus()
				]);
				return channels.map((channel) => ({
					...channel,
					...liveStatus[channel.ytHandle]
				}));
			}),
		rateLimit
	);
});

export type SidebarChannel = Awaited<ReturnType<typeof remoteGetSidebarChannels>>[number];

export const remoteGetLiveStatus = query(async () => {
	const rateLimit = getRateLimit('live');
	return DbRemoteRunner(({ db }) => db.getLiveStatus(), rateLimit);
});

export type LiveStatus = Awaited<ReturnType<typeof remoteGetLiveStatus>>;

export const remoteGetChannelDetails = query(z.string(), async (handle) => {
	const rateLimit = getRateLimit('channel');
	return DbRemoteRunner(({ db }) => db.getChannelByHandle(handle), rateLimit);
});

export type ChannelDetails = Awaited<ReturnType<typeof remoteGetChannelDetails>>;

const paginationSchema = z.object({
	limit: z.number().min(1).max(48),
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
		const rateLimit = getRateLimit('channelVideos');
		return DbRemoteRunner(
			({ db }) => db.getChannelVideos(ytChannelId, limit, offset, filter, sort, onlyHermitCraft),
			rateLimit
		);
	}
);

export type ChannelVideos = Awaited<ReturnType<typeof remoteGetChannelVideos>>;

export const remoteGetAllVideos = query(
	paginationSchema,
	async ({ limit, offset, filter, sort, onlyHermitCraft }) => {
		const rateLimit = getRateLimit('allVideos');
		return DbRemoteRunner(
			({ db }) => db.getAllVideos(limit, offset, filter, sort, onlyHermitCraft),
			rateLimit
		);
	}
);
