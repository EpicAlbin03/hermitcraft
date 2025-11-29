import { err, ok, ResultAsync } from 'neverthrow';
import { isShort } from '../../utils/isShort';
import { google } from 'googleapis';

const youtube = google.youtube({
	version: 'v3',
	auth: Bun.env.YT_API_KEY!
});

export const YT_QUERIES = {
	getChannelDetails: (data: { ytChannelId: string }) => {
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
					item.snippet.thumbnails?.high?.url ||
					item.snippet.thumbnails?.medium?.url ||
					item.snippet.thumbnails?.default?.url ||
					'',
				bannerUrl: item.brandingSettings?.image?.bannerExternalUrl || '',
				handle: item.snippet.customUrl || '',
				viewCount: parseInt(item.statistics?.viewCount || '0', 10),
				subscriberCount: parseInt(item.statistics?.subscriberCount || '0', 10),
				videoCount: parseInt(item.statistics?.videoCount || '0', 10),
				joinedAt: new Date(item.snippet.publishedAt || 0)
			});
		});
	},

	getVideoDetails: (data: { ytVideoId: string }) => {
		return ResultAsync.fromPromise(
			youtube.videos.list({
				part: ['snippet', 'statistics', 'contentDetails', 'liveStreamingDetails'],
				id: [data.ytVideoId]
			}),
			(error) => new Error(`Failed to get details for video ${data.ytVideoId}: ${error}`)
		).andThen((response) => {
			const item = response.data.items?.[0];
			if (!item || !item.id || !item.snippet || !item.snippet.channelId) {
				return err(new Error(`Video ${data.ytVideoId} not found`));
			}

			const thumbnail =
				item.snippet.thumbnails?.maxres ||
				item.snippet.thumbnails?.standard ||
				item.snippet.thumbnails?.high ||
				item.snippet.thumbnails?.medium ||
				item.snippet.thumbnails?.default;

			return ok({
				ytVideoId: item.id,
				ytChannelId: item.snippet.channelId,
				title: item.snippet.title || '',
				description: item.snippet.description || '',
				thumbnailUrl: thumbnail?.url || '',
				thumbnailWidth: thumbnail?.width || 0,
				thumbnailHeight: thumbnail?.height || 0,
				publishedAt: new Date(item.snippet.publishedAt || 0),
				viewCount: parseInt(item.statistics?.viewCount || '0', 10),
				likeCount: parseInt(item.statistics?.likeCount || '0', 10),
				commentCount: parseInt(item.statistics?.commentCount || '0', 10),
				duration: item.contentDetails?.duration || '',
				isLiveStream: item.liveStreamingDetails ? true : false,
				isShort: isShort(item.contentDetails?.duration || '')
			});
		});
	},

	getBatchRSSVideoDetails: (data: { ytVideoIds: string[] }) => {
		if (data.ytVideoIds.length > 50) return err(new Error('Max 50 video IDs per request'));
		return ResultAsync.fromPromise(
			youtube.videos.list({
				part: ['statistics', 'contentDetails', 'liveStreamingDetails'],
				id: data.ytVideoIds
			}),
			(error) => new Error(`Failed to get batch video details: ${error}`)
		).map((response) => {
			const items = response.data.items || [];
			const detailsMap: Record<
				string,
				{
					commentCount: number;
					duration: string;
					isLiveStream: boolean;
					isShort: boolean;
				}
			> = {};

			for (const item of items) {
				if (item.id) {
					detailsMap[item.id] = {
						commentCount: parseInt(item.statistics?.commentCount || '0', 10),
						duration: item.contentDetails?.duration || '',
						isLiveStream: item.liveStreamingDetails === undefined ? false : true,
						isShort: isShort(item.contentDetails?.duration || '')
					};
				}
			}

			return detailsMap;
		});
	}
};
