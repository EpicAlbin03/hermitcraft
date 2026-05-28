import { getRequestEvent, query } from '$app/server';
import { DbRemoteRunner, getClientIp } from '$lib/remote/helpers';
import type { RateLimitKey } from '$lib/services/cache';
import { DbService } from '$lib/services/db';
import type { VideoFilter, VideoSort } from '$lib/services/db';
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

export const remoteGetSidebarCreators = query(async () => {
	const rateLimit = getRateLimit('sidebar');
	return DbRemoteRunner(
		Effect.gen(function* () {
			const db = yield* Effect.service(DbService);
			const [creators, liveStatus] = yield* Effect.all([db.getSidebarCreators, db.getLiveStatus]);
			return creators.map((creator) => ({
				...creator,
				...liveStatus[creator.ytHandle]
			}));
		}),
		rateLimit
	);
});

export type SidebarCreator = Awaited<ReturnType<typeof remoteGetSidebarCreators>>[number];

export const remoteGetLiveStatus = query(async () => {
	const rateLimit = getRateLimit('live');
	return DbRemoteRunner(
		Effect.service(DbService).pipe(Effect.flatMap((db) => db.getLiveStatus)),
		rateLimit
	);
});

export type LiveStatus = Awaited<ReturnType<typeof remoteGetLiveStatus>>;

export const remoteGetCreatorDetails = query(z.string(), async (handle) => {
	const rateLimit = getRateLimit('creator');
	return DbRemoteRunner(
		Effect.service(DbService).pipe(Effect.flatMap((db) => db.getCreatorByHandle(handle))),
		rateLimit
	);
});

export type CreatorDetails = Awaited<ReturnType<typeof remoteGetCreatorDetails>>;

export type VideoQueryParams = {
	limit: number;
	offset: number;
	filter: VideoFilter;
	sort: VideoSort;
	onlyHermitCraft: boolean;
};

export type CreatorVideoQueryParams = VideoQueryParams & {
	ytChannelId: string;
};

const paginationSchema = z.object({
	limit: z.number().min(1).max(48),
	offset: z.number().min(0),
	filter: videoFilterSchema.default('videos'),
	sort: videoSortSchema.default('latest'),
	onlyHermitCraft: z.boolean().default(false)
});

export const remoteGetCreatorVideos = query(
	z.object({
		ytChannelId: z.string(),
		...paginationSchema.shape
	}),
	async ({ ytChannelId, limit, offset, filter, sort, onlyHermitCraft }) => {
		const rateLimit = getRateLimit('creatorVideos');
		return DbRemoteRunner(
			Effect.service(DbService).pipe(
				Effect.flatMap((db) =>
					db.getCreatorVideos(ytChannelId, limit, offset, filter, sort, onlyHermitCraft)
				)
			),
			rateLimit
		);
	}
);

export type CreatorVideos = Awaited<ReturnType<typeof remoteGetCreatorVideos>>;

export const remoteGetAllVideos = query(
	paginationSchema,
	async ({ limit, offset, filter, sort, onlyHermitCraft }) => {
		const rateLimit = getRateLimit('allVideos');
		return DbRemoteRunner(
			Effect.service(DbService).pipe(
				Effect.flatMap((db) => db.getAllVideos(limit, offset, filter, sort, onlyHermitCraft))
			),
			rateLimit
		);
	}
);
