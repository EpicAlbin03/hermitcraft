import {
	remoteGetAllVideos,
	remoteGetCreatorVideos,
	type CreatorVideos
} from '$lib/remote/creators.remote';
import type { VideoQueryParams } from './contract';

export type VideoFeedSource =
	| { type: 'all' }
	| {
			type: 'creator';
			ytChannelId: string;
	  };

export type VideoFeedItem = CreatorVideos[number] & {
	creatorName?: string;
	creatorAvatarUrl?: string;
	creatorHandle?: string;
};

export function getVideoFeedKey(source: VideoFeedSource) {
	return source.type === 'all' ? 'all-videos' : source.ytChannelId;
}

export function fetchVideoFeed(source: VideoFeedSource, params: VideoQueryParams) {
	if (source.type === 'all') {
		return remoteGetAllVideos(params);
	}

	return remoteGetCreatorVideos({
		ytChannelId: source.ytChannelId,
		...params
	});
}
