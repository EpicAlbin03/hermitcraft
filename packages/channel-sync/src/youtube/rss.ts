import type { Video } from '@hc/db';

export const parseYouTubeRSS = (xml: string) => {
	const entries: Pick<
		Video,
		'ytVideoId' | 'title' | 'thumbnailUrl' | 'publishedAt' | 'viewCount' | 'likeCount'
	>[] = [];

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

		entries.push({
			ytVideoId: videoIdMatch[1]!,
			title: titleMatch[1]!,
			thumbnailUrl: thumbnailMatch?.[1] || '',
			publishedAt: new Date(publishedMatch[1]!),
			viewCount: parseInt(viewCountMatch?.[1] || '0', 10),
			likeCount: parseInt(likeCountMatch?.[1] || '0', 10)
		});
	}

	return entries;
};
