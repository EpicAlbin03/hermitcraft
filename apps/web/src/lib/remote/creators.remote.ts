import { getRequestEvent, query } from '$app/server';
import { DbRemoteRunner, getClientIp } from '$lib/remote/helpers';
import type { RateLimitKey } from '$lib/services/cache';
import { DbService } from '$lib/services/db';
import {
	videoBrowseParamsSchema,
	type VideoQueryParams
} from '$lib/components/video-feed/contract';
import { Effect } from 'effect';
import { z } from 'zod';

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
		Effect.service(DbService).pipe(Effect.flatMap((db) => db.getSidebarCreatorsWithLiveStatus)),
		rateLimit
	);
});

export type SidebarCreator = Awaited<ReturnType<typeof remoteGetSidebarCreators>>[number];

export const remoteGetCreatorDetails = query(z.string(), async (handle) => {
	const rateLimit = getRateLimit('creator');
	return DbRemoteRunner(
		Effect.service(DbService).pipe(Effect.flatMap((db) => db.getCreatorByHandle(handle))),
		rateLimit
	);
});

export type CreatorDetails = Awaited<ReturnType<typeof remoteGetCreatorDetails>>;
export type { VideoQueryParams };

export const remoteGetCreatorVideos = query(
	z.object({
		ytChannelId: z.string(),
		...videoBrowseParamsSchema.shape
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
	videoBrowseParamsSchema,
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
