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

export function getShortsPlaylistId(ytChannelId: string) {
	if (!ytChannelId.startsWith('UC')) {
		return null;
	}
	return 'UUSH' + ytChannelId.slice(2);
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
