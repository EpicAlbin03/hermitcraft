import { DB_SCHEMA } from '@hc/db/schema';
import { and, asc, desc, eq, ilike, inArray, type SQLWrapper } from 'drizzle-orm';
import type { VideoFilter, VideoSort } from '$lib/components/video-feed/contract';

const PUBLIC_UPLOAD_STATUSES = ['uploaded', 'processed'] as const;
const LIVESTREAM_FEED_TYPES = ['live', 'upcoming', 'completed'] as const;

export const videoSelect = {
	ytVideoId: DB_SCHEMA.videos.ytVideoId,
	title: DB_SCHEMA.videos.title,
	thumbnailUrl: DB_SCHEMA.videos.thumbnailUrl,
	publishedAt: DB_SCHEMA.videos.publishedAt,
	viewCount: DB_SCHEMA.videos.viewCount,
	likeCount: DB_SCHEMA.videos.likeCount,
	commentCount: DB_SCHEMA.videos.commentCount,
	duration: DB_SCHEMA.videos.durationSeconds,
	isShort: DB_SCHEMA.videos.isShort,
	livestreamType: DB_SCHEMA.videos.livestreamType,
	livestreamScheduledStartTime: DB_SCHEMA.videos.livestreamScheduledStartTime,
	livestreamActualStartTime: DB_SCHEMA.videos.livestreamActualStartTime,
	livestreamConcurrentViewers: DB_SCHEMA.videos.livestreamConcurrentViewers
};

export const videoSelectWithCreator = {
	...videoSelect,
	creatorName: DB_SCHEMA.creators.ytName,
	creatorAvatarUrl: DB_SCHEMA.creators.ytAvatarUrl,
	creatorHandle: DB_SCHEMA.creators.ytHandle
};

function getPublicVideoConditions(onlyHermitCraft: boolean) {
	const conditions = [
		inArray(DB_SCHEMA.videos.uploadStatus, PUBLIC_UPLOAD_STATUSES),
		eq(DB_SCHEMA.videos.privacyStatus, 'public')
	];

	if (onlyHermitCraft) {
		conditions.push(ilike(DB_SCHEMA.videos.title, '%hermitcraft%'));
	}

	return conditions;
}

function getVideoFeedKindCondition(filter: VideoFilter) {
	switch (filter) {
		case 'livestreams':
			return inArray(DB_SCHEMA.videos.livestreamType, LIVESTREAM_FEED_TYPES);
		case 'shorts':
			return eq(DB_SCHEMA.videos.isShort, true);
		case 'videos':
		default:
			return and(eq(DB_SCHEMA.videos.livestreamType, 'none'), eq(DB_SCHEMA.videos.isShort, false));
	}
}

export function buildVideoFeedWhere(
	filter: VideoFilter,
	onlyHermitCraft: boolean,
	...scope: SQLWrapper[]
) {
	return and(
		...scope,
		getVideoFeedKindCondition(filter),
		...getPublicVideoConditions(onlyHermitCraft)
	);
}

export function getVideoFeedOrderBy(sort: VideoSort) {
	switch (sort) {
		case 'most_viewed':
			return desc(DB_SCHEMA.videos.viewCount);
		case 'most_liked':
			return desc(DB_SCHEMA.videos.likeCount);
		case 'oldest':
			return asc(DB_SCHEMA.videos.publishedAt);
		case 'latest':
		default:
			return desc(DB_SCHEMA.videos.publishedAt);
	}
}
