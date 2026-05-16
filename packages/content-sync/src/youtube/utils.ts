import type { Video } from '@hc/db';

export function parseIsoDurationToSeconds(duration: string): number | null {
	const ISO_DURATION_PATTERN = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;
	const match = ISO_DURATION_PATTERN.exec(duration);
	if (!match) return null;

	const days = Number.parseInt(match[1] ?? '0', 10);
	const hours = Number.parseInt(match[2] ?? '0', 10);
	const minutes = Number.parseInt(match[3] ?? '0', 10);
	const seconds = Number.parseInt(match[4] ?? '0', 10);

	const totalSeconds = ((days * 24 + hours) * 60 + minutes) * 60 + seconds;
	return Number.isNaN(totalSeconds) ? null : totalSeconds;
}

export const parseYtRSS = (xml: string) => {
	const ytVideoIds: string[] = [];

	const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
	let match;

	while ((match = entryRegex.exec(xml)) !== null) {
		const entryXml = match[1];

		if (!entryXml) continue;

		const videoIdMatch = entryXml.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
		// const titleMatch = entryXml.match(/<title>([^<]+)<\/title>/);
		// const thumbnailMatch = entryXml.match(/<media:thumbnail[^>]+url="([^"]+)"/);
		// const publishedMatch = entryXml.match(/<published>([^<]+)<\/published>/);
		// const viewCountMatch = entryXml.match(/<media:statistics[^>]+views="([^"]+)"/);
		// const likeCountMatch = entryXml.match(/<media:starRating[^>]+count="([^"]+)"/);

		if (!videoIdMatch) continue;

		ytVideoIds.push(videoIdMatch[1]!);
	}

	return ytVideoIds;
};

export function getYtPlaylistId(
	ytChannelId: string,
	type:
		| 'videos'
		| 'popularVideos'
		| 'livestreams'
		| 'membersOnlyVideos'
		| 'membersOnlyContents'
		| 'membersOnlyShorts'
		| 'membersOnlyLivestreams'
		| 'popularShorts'
		| 'popularLivestreams'
		| 'shorts'
) {
	if (!ytChannelId.startsWith('UC')) {
		return null;
	}

	switch (type) {
		case 'videos': // Doesn't include shorts and livestreams
			return 'UULF' + ytChannelId.slice(2);
		case 'popularVideos':
			return 'UULP' + ytChannelId.slice(2);
		case 'livestreams':
			return 'UULV' + ytChannelId.slice(2);
		case 'membersOnlyVideos':
			return 'UUMF' + ytChannelId.slice(2);
		case 'membersOnlyContents':
			return 'UUMO' + ytChannelId.slice(2);
		case 'membersOnlyShorts':
			return 'UUMS' + ytChannelId.slice(2);
		case 'membersOnlyLivestreams':
			return 'UUMV' + ytChannelId.slice(2);
		case 'popularShorts':
			return 'UUPS' + ytChannelId.slice(2);
		case 'popularLivestreams':
			return 'UUPV' + ytChannelId.slice(2);
		case 'shorts':
			return 'UUSH' + ytChannelId.slice(2);
	}
}

export function getVideoLivestreamType(
	liveBroadcastContent: 'live' | 'none' | 'upcoming',
	hasBeenLivestream: boolean
): Video['livestreamType'] {
	switch (liveBroadcastContent) {
		case 'live':
			return 'live';
		case 'upcoming':
			return 'upcoming';
		case 'none':
			return hasBeenLivestream ? 'completed' : 'none';
	}
}
