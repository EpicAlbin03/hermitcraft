import { err, ok } from 'neverthrow';
import { DB_QUERIES } from './db';
import type { Video } from '..';

export const getRecentVideosForChannel = async (args: { ytChannelId: string }) => {
	const channel = await DB_QUERIES.getChannel(args.ytChannelId);
	if (!channel) {
		return err(new Error(`Channel ${args.ytChannelId} not found`));
	}

	// Latest 15 videos
	const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${args.ytChannelId}`;

	const response = await fetch(rssUrl);

	if (!response.ok) {
		return err(new Error(`Failed to fetch RSS for channel ${args.ytChannelId}`));
	}

	const xml = await response.text();
	const entries = parseYouTubeRSS(xml);

	return ok(entries);
};

const parseYouTubeRSS = (xml: string) => {
	const entries: Omit<Video, 'createdAt' | 'ytChannelId'>[] = [];

	const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
	let match;

	while ((match = entryRegex.exec(xml)) !== null) {
		const entryXml = match[1];

		if (!entryXml) continue;

		const videoIdMatch = entryXml.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
		const titleMatch = entryXml.match(/<title>([^<]+)<\/title>/);
		const thumbnailMatch = entryXml.match(/<media:thumbnail[^>]+url="([^"]+)"/);
		const publishedMatch = entryXml.match(/<published>([^<]+)<\/published>/);
		const viewCountMatch = entryXml.match(/<media:statistics[^>]+views="([^"]+)"/);
		const likeCountMatch = entryXml.match(/<media:starRating[^>]+count="([^"]+)"/);

		if (!videoIdMatch || !titleMatch || !publishedMatch) continue;

		if (videoIdMatch && titleMatch && publishedMatch) {
			entries.push({
				ytVideoId: videoIdMatch[1]!,
				title: titleMatch[1]!,
				thumbnailUrl: thumbnailMatch?.[1] || '',
				publishedAt: new Date(publishedMatch[1]!),
				viewCount: parseInt(viewCountMatch?.[1] || '0', 10),
				likeCount: parseInt(likeCountMatch?.[1] || '0', 10),
				commentCount: 0
			});
		}
	}

	return entries;
};
