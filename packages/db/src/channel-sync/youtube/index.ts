import { google } from 'googleapis';
import { ResultAsync, err, ok } from 'neverthrow';

const youtube = google.youtube({
	version: 'v3',
	auth: Bun.env.YT_API_KEY!
});

export const getChannelDetails = (data: { ytChannelId: string }) => {
	return ResultAsync.fromPromise(
		youtube.channels.list({
			part: ['id', 'snippet', 'statistics', 'brandingSettings'],
			id: [data.ytChannelId]
		}),
		(error) => new Error(`Failed to get details for channel ${data.ytChannelId}: ${error}`)
	).andThen((response) => {
		const item = response.data.items?.[0];
		if (!item || !item.id || !item.snippet) {
			return err(new Error(`Channel ${data.ytChannelId} not found`));
		}

		return ok({
			ytChannelId: item.id,
			name: item.snippet.title || '',
			description: item.snippet.description || '',
			thumbnailUrl:
				item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url || '',
			bannerUrl: item.brandingSettings?.image?.bannerExternalUrl || '',
			handle: item.snippet.customUrl || '',
			viewCount: parseInt(item.statistics?.viewCount || '0', 10),
			subscriberCount: parseInt(item.statistics?.subscriberCount || '0', 10),
			videoCount: parseInt(item.statistics?.videoCount || '0', 10),
			joinedAt: new Date(item.snippet.publishedAt || 0)
		});
	});
};

export const getVideoDetails = (data: { ytVideoId: string }) => {
	return ResultAsync.fromPromise(
		youtube.videos.list({
			part: ['snippet', 'statistics', 'contentDetails'],
			id: [data.ytVideoId]
		}),
		(error) => new Error(`Failed to get details for video ${data.ytVideoId}: ${error}`)
	).andThen((response) => {
		const item = response.data.items?.[0];
		if (!item || !item.id || !item.snippet || !item.snippet.channelId) {
			return err(new Error(`Video ${data.ytVideoId} not found`));
		}

		return ok({
			channelId: item.snippet.channelId,
			videoId: item.id,
			title: item.snippet.title || '',
			description: item.snippet.description || '',
			thumbnailUrl:
				item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url || '',
			publishedAt: new Date(item.snippet.publishedAt || 0),
			viewCount: parseInt(item.statistics?.viewCount || '0', 10),
			likeCount: parseInt(item.statistics?.likeCount || '0', 10),
			commentCount: parseInt(item.statistics?.commentCount || '0', 10)
		});
	});
};
